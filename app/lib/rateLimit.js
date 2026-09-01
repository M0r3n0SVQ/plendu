import { Ratelimit } from '@upstash/ratelimit'
import { redis, upstashConfigured } from './redis'

export function getClientIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

// Returns an async checkRateLimit(ip) -> { limited, retryAfter }, backed by
// Upstash when configured, or a per-instance in-memory Map otherwise. Each
// call owns its own state (own Upstash prefix, own Map), so routes with
// different limits never share a budget.
export function createRateLimiter({ prefix, windowMs, max }) {
  const ratelimit = upstashConfigured
    ? new Ratelimit({
        redis,
        limiter:  Ratelimit.slidingWindow(max, `${Math.round(windowMs / 1000)} s`),
        analytics: true,
        prefix:   `plendu:rl:${prefix}`,
      })
    : null

  const memoryMap = new Map()

  function isLimitedInMemory(ip) {
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
  return async function checkRateLimit(ip) {
    if (ratelimit) {
      try {
        const { success, reset } = await ratelimit.limit(ip)
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        return { limited: !success, retryAfter }
      } catch (err) {
        console.error(`[ratelimit:${prefix}] upstash failed, allowing request:`, err?.message)
        return { limited: false, retryAfter: 60 }
      }
    }
    return { limited: isLimitedInMemory(ip), retryAfter: 60 }
  }
}
