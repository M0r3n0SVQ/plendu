import { describe, it, expect, vi } from 'vitest'

// Sync needs Upstash actually "configured" to exercise its real logic
// (otherwise every request 503s before reaching any of it) — unlike
// route.test.js for /api/analyze, which deliberately tests the in-memory
// rate-limit fallback. Stubbed here only, so it doesn't affect that file's
// module instance (Vitest isolates module registries per test file).
// Must run before the dynamic import below — app/lib/redis.js reads these
// at module-evaluation time, which a beforeAll() hook would run too late for.
vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake-upstash.example')
vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake-token')

// Minimal in-memory stand-ins — enough to exercise the route's own logic
// (validation, sanitization, storage) without asserting on Upstash's actual
// sliding-window algorithm, which is already covered where it's shared from
// (app/lib/rateLimit.js, exercised via app/api/analyze/route.test.js).
vi.mock('@upstash/redis', () => {
  const store = new Map()
  class FakeRedis {
    static fromEnv() { return new FakeRedis() }
    async get(key) { return store.has(key) ? store.get(key) : null }
    async set(key, value) { store.set(key, value); return 'OK' }
    async del(key) { const had = store.delete(key); return had ? 1 : 0 }
  }
  return { Redis: FakeRedis, __store: store }
})

vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    constructor({ limiter }) {
      this.max = limiter.max
      this.windowMs = limiter.windowMs
      this.hits = new Map()
    }
    async limit(id) {
      const now = Date.now()
      const rec = this.hits.get(id)
      if (!rec || now - rec.start >= this.windowMs) {
        this.hits.set(id, { start: now, count: 1 })
        return { success: true, reset: now + this.windowMs }
      }
      rec.count++
      return { success: rec.count <= this.max, reset: rec.start + this.windowMs }
    }
  }
  FakeRatelimit.slidingWindow = (max, windowStr) => ({ max, windowMs: parseInt(windowStr, 10) * 1000 })
  return { Ratelimit: FakeRatelimit }
})

const { GET, POST, DELETE } = await import('./route.js')

let ipCounter = 0
function freshIP() {
  return `10.1.0.${++ipCounter}`
}

const validFicha = {
  titulo: 'Camiseta de prueba', descripcion: 'x', precio: 5,
  estado: 'Bueno', categoria: 'Camisetas', marca: '', talla: 'M',
}
function makeItem(id) {
  return { id, fecha: '27 ago', ficha: validFicha, thumbnail: null, vendida: false, precioVenta: null }
}

function makeGet(code, ip = freshIP()) {
  const url = code === undefined ? 'http://localhost/api/sync' : `http://localhost/api/sync?code=${encodeURIComponent(code)}`
  return new Request(url, { headers: { 'x-forwarded-for': ip } })
}

function makePost(body, { ip = freshIP(), rawContentLength } = {}) {
  const json = body === undefined ? undefined : JSON.stringify(body)
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip }
  if (rawContentLength !== null) {
    headers['content-length'] = String(rawContentLength ?? (json ? Buffer.byteLength(json) : 0))
  }
  return new Request('http://localhost/api/sync', { method: 'POST', headers, body: json })
}

describe('GET /api/sync', () => {
  it('400s when code is missing', async () => {
    const res = await GET(makeGet(undefined))
    expect(res.status).toBe(400)
  })

  it('400s when code has an invalid shape', async () => {
    const res = await GET(makeGet('short'))
    expect(res.status).toBe(400)
  })

  it('returns an empty historial and found:false for a code nothing was ever pushed to', async () => {
    const res = await GET(makeGet('AAAA-BBBB-CCCC'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.historial).toEqual([])
    expect(body.found).toBe(false)
  })

  it('returns found:true once something has been pushed, even if later empty', async () => {
    const code = 'FOUNDTRUE001'
    await POST(makePost({ code, historial: [] }))
    const res = await GET(makeGet(code))
    const body = await res.json()
    expect(body.found).toBe(true)
    expect(body.historial).toEqual([])
  })
})

describe('POST /api/sync', () => {
  it('411s when Content-Length is missing', async () => {
    const res = await POST(makePost({ code: 'AAAA-BBBB-CCCC', historial: [] }, { rawContentLength: null }))
    expect(res.status).toBe(411)
  })

  it('413s when Content-Length exceeds the cap', async () => {
    const res = await POST(makePost({ code: 'AAAA-BBBB-CCCC', historial: [] }, { rawContentLength: 4 * 1024 * 1024 }))
    expect(res.status).toBe(413)
  })

  it('400s on malformed JSON', async () => {
    const ip = freshIP()
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '13', 'x-forwarded-for': ip },
      body: '{not: valid}',
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('400s when the code is invalid', async () => {
    const res = await POST(makePost({ code: '!!', historial: [] }))
    expect(res.status).toBe(400)
  })

  it('accepts a valid push and a later GET returns it', async () => {
    const code = 'TEST-CODE-0001'
    const historial = [makeItem(2), makeItem(1)]
    const postRes = await POST(makePost({ code, historial }))
    expect(postRes.status).toBe(200)
    const postBody = await postRes.json()
    expect(postBody.count).toBe(2)

    const getRes = await GET(makeGet(code))
    const getBody = await getRes.json()
    expect(getBody.historial).toHaveLength(2)
    expect(getBody.historial.map(i => i.id).sort()).toEqual([1, 2])
  })

  it('caps stored historial at 10 items even if more are pushed', async () => {
    const code = 'TEST-CODE-0002'
    const historial = Array.from({ length: 15 }, (_, i) => makeItem(i))
    await POST(makePost({ code, historial }))
    const getRes = await GET(makeGet(code))
    const getBody = await getRes.json()
    expect(getBody.historial).toHaveLength(10)
  })

  it('drops malformed items instead of storing them', async () => {
    const code = 'TEST-CODE-0003'
    const historial = [makeItem(1), { id: 'not-a-number', fecha: 'x', ficha: validFicha }, null, 'garbage']
    await POST(makePost({ code, historial }))
    const getRes = await GET(makeGet(code))
    const getBody = await getRes.json()
    expect(getBody.historial).toHaveLength(1)
    expect(getBody.historial[0].id).toBe(1)
  })

  it('two different codes never see each other\'s data', async () => {
    const codeA = 'TEST-CODE-AAAA'
    const codeB = 'TEST-CODE-BBBB'
    await POST(makePost({ code: codeA, historial: [makeItem(100)] }))
    await POST(makePost({ code: codeB, historial: [makeItem(200)] }))
    const bodyA = await (await GET(makeGet(codeA))).json()
    const bodyB = await (await GET(makeGet(codeB))).json()
    expect(bodyA.historial.map(i => i.id)).toEqual([100])
    expect(bodyB.historial.map(i => i.id)).toEqual([200])
  })
})

describe('DELETE /api/sync', () => {
  it('400s when the code is invalid', async () => {
    const res = await DELETE(makeGet('short'))
    expect(res.status).toBe(400)
  })

  it('removes a previously pushed historial so a later GET comes back empty', async () => {
    const code = 'DELETE-ME-0001'
    await POST(makePost({ code, historial: [makeItem(1)] }))
    expect((await (await GET(makeGet(code))).json()).historial).toHaveLength(1)

    const delRes = await DELETE(makeGet(code))
    expect(delRes.status).toBe(200)

    const after = await (await GET(makeGet(code))).json()
    expect(after.historial).toEqual([])
  })

  it('is a no-op (not an error) for a code that was never used', async () => {
    const res = await DELETE(makeGet('ZZZZ-NOPE-0001'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/sync — rate limiting', () => {
  it('429s once a single IP exceeds the configured max', async () => {
    const ip = freshIP()
    const results = []
    for (let i = 0; i < 22; i++) {
      results.push((await POST(makePost({ code: 'RATE-LIMT-TEST', historial: [] }, { ip }))).status)
    }
    expect(results.slice(0, 20)).not.toContain(429)
    expect(results[20]).toBe(429)
  })
})
