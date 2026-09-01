import { describe, it, expect, vi } from 'vitest'

// Replaces the real SDK for this whole file — no test here should ever make
// a real network call to OpenAI. Returns a fixed, schema-valid ficha so the
// happy-path tests can check safeFicha's sanitization/renaming (e.g.
// campos_dudosos -> camposDudosos) without depending on live model output.
vi.mock('openai', () => {
  // A single shared mock fn, not one per instance — route.js constructs its
  // own OpenAI client once at module load, so tests need a handle to the
  // exact same function to override its response (see __createMock below).
  const createMock = vi.fn(async () => ({
    choices: [{
      message: {
        content: JSON.stringify({
          _analisis: 'prenda de prueba',
          titulo: 'Camiseta de prueba azul talla M',
          descripcion: 'Descripción de prueba.',
          precio: 12,
          categoria: 'Camisetas y tops',
          estado: 'Muy bueno',
          marca: 'TestBrand',
          talla: 'M',
          campos_dudosos: ['talla'],
          alerta: '',
        }),
      },
    }],
  }))
  class FakeOpenAI {
    chat = { completions: { create: createMock } }
  }
  return { default: FakeOpenAI, __createMock: createMock }
})

const { POST, isValidBase64 } = await import('./route.js')
const { __createMock: createMock } = await import('openai')

// Any valid base64 string works — the route only checks charset/length here,
// never decodes real image bytes.
const FAKE_B64 = 'aGVsbG8gd29ybGQ='
const validFoto = { data: FAKE_B64, mime: 'image/jpeg' }

let ipCounter = 0
// Each test gets its own fake IP so the in-memory rate limiter (a module-level
// Map, shared across every test in this file) can't make one test's requests
// count against another's.
function freshIP() {
  return `10.0.0.${++ipCounter}`
}

function makeRequest(body, { headers = {}, ip = freshIP(), rawContentLength } = {}) {
  const json = body === undefined ? undefined : JSON.stringify(body)
  const finalHeaders = {
    'content-type': 'application/json',
    'x-forwarded-for': ip,
    ...headers,
  }
  if (rawContentLength !== null) {
    finalHeaders['content-length'] = String(rawContentLength ?? (json ? Buffer.byteLength(json) : 0))
  }
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: finalHeaders,
    body: json,
  })
}

describe('isValidBase64', () => {
  it('accepts a plain base64 string', () => {
    expect(isValidBase64(FAKE_B64)).toBe(true)
  })
  it('accepts padding', () => {
    expect(isValidBase64('YQ==')).toBe(true)
  })
  it('rejects non-string input', () => {
    expect(isValidBase64(123)).toBe(false)
    expect(isValidBase64(null)).toBe(false)
    expect(isValidBase64(undefined)).toBe(false)
  })
  it('rejects an empty string', () => {
    expect(isValidBase64('')).toBe(false)
  })
  it('rejects characters outside the base64 alphabet', () => {
    expect(isValidBase64('not base64!! <script>')).toBe(false)
  })
  it('rejects a string over the length cap', () => {
    expect(isValidBase64('A'.repeat(8 * 1024 * 1024))).toBe(false)
  })
})

describe('POST /api/analyze — validation (all fail before reaching OpenAI)', () => {
  it('411s when Content-Length is missing', async () => {
    const req = makeRequest({ fotos: { principal: validFoto } }, { rawContentLength: null })
    const res = await POST(req)
    expect(res.status).toBe(411)
  })

  it('413s when Content-Length exceeds the 30 MB cap', async () => {
    const req = makeRequest({ fotos: { principal: validFoto } }, { rawContentLength: 31 * 1024 * 1024 })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it('400s on malformed JSON', async () => {
    const ip = freshIP()
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '13', 'x-forwarded-for': ip },
      body: '{not: valid}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400s when "fotos" is missing entirely', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400s when "fotos" is an array instead of an object', async () => {
    const req = makeRequest({ fotos: [validFoto] })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400s when the principal photo is missing', async () => {
    const req = makeRequest({ fotos: { etiqueta: validFoto } })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/principal/i)
  })

  it('400s when the principal photo has a disallowed mime type', async () => {
    const req = makeRequest({ fotos: { principal: { data: FAKE_B64, mime: 'image/gif' } } })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400s when the principal photo has invalid base64 data', async () => {
    const req = makeRequest({ fotos: { principal: { data: 'not-base64!!', mime: 'image/jpeg' } } })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400s when an optional photo (etiqueta) is invalid, even with a valid principal', async () => {
    const req = makeRequest({
      fotos: { principal: validFoto, etiqueta: { data: FAKE_B64, mime: 'application/pdf' } },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/etiqueta/i)
  })
})

describe('POST /api/analyze — happy path (mocked OpenAI)', () => {
  it('accepts a request with only the principal photo and returns a sanitized ficha', async () => {
    const req = makeRequest({ fotos: { principal: validFoto } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      titulo: 'Camiseta de prueba azul talla M',
      precio: 12,
      categoria: 'Camisetas y tops',
      estado: 'Muy bueno',
      marca: 'TestBrand',
      talla: 'M',
      alerta: '',
    })
    // snake_case from the model -> camelCase on the wire to the client
    expect(body.camposDudosos).toEqual(['talla'])
  })

  it('drops unrecognized values out of camposDudosos instead of passing them through', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            _analisis: 'x', titulo: 'x', descripcion: 'x', precio: 1,
            categoria: 'Camisetas y tops', estado: 'Bueno', marca: '', talla: '',
            // "no_es_un_campo_real" isn't a real field name — simulates the
            // model going off-script despite the schema's enum constraint.
            campos_dudosos: ['talla', 'no_es_un_campo_real'],
            alerta: '',
          }),
        },
      }],
    })
    const req = makeRequest({ fotos: { principal: validFoto } })
    const res = await POST(req)
    const body = await res.json()
    expect(body.camposDudosos).toEqual(['talla'])
  })

  it('502s when the AI response is missing a required field (titulo)', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            _analisis: 'x', descripcion: 'x', precio: 1,
            categoria: 'Camisetas y tops', estado: 'Bueno', marca: '', talla: '',
            campos_dudosos: [], alerta: '',
          }),
        },
      }],
    })
    const req = makeRequest({ fotos: { principal: validFoto } })
    const res = await POST(req)
    expect(res.status).toBe(502)
  })

  it('clamps an out-of-range precio instead of rejecting the whole response', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            _analisis: 'x', titulo: 'x', descripcion: 'x', precio: 50000,
            categoria: 'Camisetas y tops', estado: 'Bueno', marca: '', talla: '',
            campos_dudosos: [], alerta: '',
          }),
        },
      }],
    })
    const req = makeRequest({ fotos: { principal: validFoto } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.precio).toBe(9999)
  })
})

describe('POST /api/analyze — rate limiting (in-memory fallback, no Upstash configured)', () => {
  it('allows the first 10 requests from one IP within the window, then 429s the 11th', async () => {
    const ip = freshIP()
    const results = []
    for (let i = 0; i < 11; i++) {
      const req = makeRequest({ fotos: { principal: validFoto } }, { ip })
      results.push((await POST(req)).status)
    }
    expect(results.slice(0, 10)).not.toContain(429)
    expect(results[10]).toBe(429)
  })

  it('tracks each IP independently', async () => {
    const ipA = freshIP()
    const ipB = freshIP()
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ fotos: { principal: validFoto } }, { ip: ipA }))
    }
    // A is now at its limit; B has made zero requests and should be unaffected.
    const resB = await POST(makeRequest({ fotos: { principal: validFoto } }, { ip: ipB }))
    expect(resB.status).not.toBe(429)
  })
})
