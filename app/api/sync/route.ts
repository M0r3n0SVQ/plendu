import * as Sentry from '@sentry/nextjs'
import { redis } from '../../lib/redis'
import { createRateLimiter, getClientIP, rateLimitResponse, checkContentLength } from '../../lib/rateLimit'
import { sanitizeHistorial, MAX_HISTORIAL } from '../../lib/historial'

// Vercel: pin to Node runtime (Upstash SDK), force per-request execution.
export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'

// Reads/writes are cheap key-value ops (no AI call), so this can be more
// generous than /api/analyze — a device auto-pushing after every generate
// is a normal usage pattern, not abuse.
const checkRateLimit = createRateLimiter({ prefix: 'sync', windowMs: 60_000, max: 20 })

// 90 days, refreshed on every write — long enough that a code stays useful
// across a normal selling season, short enough that abandoned codes don't
// sit in Redis forever. This is a lightweight cross-device bridge, not
// permanent cloud storage — the privacy policy says so explicitly.
const SYNC_TTL_SECONDS = 90 * 24 * 60 * 60

const MAX_BODY_BYTES = 3 * 1024 * 1024 // 10 items x <200KB thumbnail + text, with margin

// Client generates "XXXX-XXXX-XXXX" (12 alphanumeric chars) from a readable
// alphabet — matched exactly here so a truncated or mistyped guess is
// rejected client-side instead of being looked up in Redis.
function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return /^[A-Z0-9]{12}$/.test(code) ? code : null
}

const redisKey = (code: string) => `plendu:sync:${code}`

function serviceUnavailable() {
  return Response.json(
    { error: 'La sincronización no está disponible ahora mismo.' },
    { status: 503 }
  )
}

export async function GET(request: Request): Promise<Response> {
  const { limited, retryAfter } = await checkRateLimit(getClientIP(request))
  if (limited) return rateLimitResponse(retryAfter)
  if (!redis) return serviceUnavailable()

  const code = normalizeCode(new URL(request.url).searchParams.get('code'))
  if (!code) {
    return Response.json({ error: 'Código inválido.' }, { status: 400 })
  }

  try {
    const stored = await redis.get(redisKey(code))
    const historial = sanitizeHistorial(stored, MAX_HISTORIAL)
    // Distinguishes "this code was never pushed to" from "it was pushed to
    // and is legitimately empty" — the client needs this to tell a mistyped
    // code apart from a real one with nothing in it.
    const found = stored !== null && stored !== undefined
    return Response.json({ historial, found }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/sync', method: 'GET' } })
    return Response.json({ error: 'No se pudo leer la sincronización.' }, { status: 500 })
  }
}

// Lets a user delete their synced copy on demand instead of only relying on
// the 90-day TTL — the privacy policy promises this is possible.
export async function DELETE(request: Request): Promise<Response> {
  const { limited, retryAfter } = await checkRateLimit(getClientIP(request))
  if (limited) return rateLimitResponse(retryAfter)
  if (!redis) return serviceUnavailable()

  const code = normalizeCode(new URL(request.url).searchParams.get('code'))
  if (!code) {
    return Response.json({ error: 'Código inválido.' }, { status: 400 })
  }

  try {
    await redis.del(redisKey(code))
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/sync', method: 'DELETE' } })
    return Response.json({ error: 'No se pudo eliminar la sincronización.' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  const { limited, retryAfter } = await checkRateLimit(getClientIP(request))
  if (limited) return rateLimitResponse(retryAfter)
  if (!redis) return serviceUnavailable()

  const clError = checkContentLength(request, MAX_BODY_BYTES)
  if (clError) return clError

  let code: string | null
  let historial: ReturnType<typeof sanitizeHistorial>
  try {
    const body = await request.json()
    code = normalizeCode(body?.code)
    // Never trust a client payload just because it looks like real fichas —
    // the same validation localStorage itself goes through on load.
    historial = sanitizeHistorial(body?.historial, MAX_HISTORIAL)
  } catch {
    return Response.json({ error: 'Petición inválida.' }, { status: 400 })
  }
  if (!code) {
    return Response.json({ error: 'Código inválido.' }, { status: 400 })
  }

  try {
    await redis.set(redisKey(code), historial, { ex: SYNC_TTL_SECONDS })
    return Response.json({ ok: true, count: historial.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/sync', method: 'POST' } })
    return Response.json({ error: 'No se pudo guardar la sincronización.' }, { status: 500 })
  }
}
