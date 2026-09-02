import { Ratelimit } from '@upstash/ratelimit'
import { redis } from './redis'

export function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

// Shared 429 body/headers for every rate-limited route — kept in one place
// so a future change (wording, an added header) doesn't need editing at
// each call site and risk drifting between them.
export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: 'Demasiadas peticiones. Espera un momento.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  )
}

// Validates the Content-Length header before the body is even read — a
// missing header is rejected outright (411) rather than trusting an
// unbounded read, and an oversized one is rejected (413) without buffering
// it. Returns the Response to return as-is, or null if the request can
// proceed.
export function checkContentLength(request: Request, maxBytes: number): Response | null {
  const clRaw = request.headers.get('content-length')
  if (!clRaw) {
    return Response.json({ error: 'Petición inválida.' }, { status: 411 })
  }
  const clHeader = parseInt(clRaw, 10)
  if (isNaN(clHeader) || clHeader > maxBytes) {
    return Response.json({ error: 'Petición demasiado grande.' }, { status: 413 })
  }
  return null
}

interface RateLimiterOptions {
  prefix: string
  windowMs: number
  max: number
}

interface RateLimitResult {
  limited: boolean
  retryAfter: number
}

// Returns an async checkRateLimit(ip) -> { limited, retryAfter }, backed by
// Upstash when configured, or a per-instance in-memory Map otherwise. Each
// call owns its own state (own Upstash prefix, own Map), so routes with
// different limits never share a budget.
export function createRateLimiter({ prefix, windowMs, max }: RateLimiterOptions) {
  // Narrowing on `redis` itself (not a separate boolean flag) is what lets
  // TypeScript know it's non-null inside this block.
  const ratelimit = redis
    ? new Ratelimit({
        redis,
        limiter:  Ratelimit.slidingWindow(max, `${Math.round(windowMs / 1000)} s`),
        analytics: true,
        prefix:   `plendu:rl:${prefix}`,
      })
    : null

  const memoryMap = new Map<string, { windowStart: number; count: number }>()

  function isLimitedInMemory(ip: string): boolean {
    const now = Date.now()
    if (memoryMap.size > 10_000) memoryMap.clear()

    const record = memoryMap.get(ip)
    if (!record || now - record.windowStart >= windowMs) {
      memoryMap.set(ip, { windowStart: now, count: 1 })
      return false
    }
    if (record.count >= max) return true
    record.count++
    return false
  }

  // On Upstash error we fail OPEN: legitimate users shouldn't be blocked by
  // our infra failing. Downstream cost/size caps are the real safety net.
  return async function checkRateLimit(ip: string): Promise<RateLimitResult> {
    if (ratelimit) {
      try {
        const { success, reset } = await ratelimit.limit(ip)
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        return { limited: !success, retryAfter }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[ratelimit:${prefix}] upstash failed, allowing request:`, message)
        return { limited: false, retryAfter: 60 }
      }
    }
    return { limited: isLimitedInMemory(ip), retryAfter: 60 }
  }
}
