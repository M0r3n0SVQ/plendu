import { Redis } from '@upstash/redis'

// Shared across every route that needs Upstash — rate limiting (analyze,
// sync) and now the sync feature's actual key-value storage. Without these
// env vars configured, `redis` is null and each caller falls back to its
// own degraded-but-working behavior (in-memory rate limiting, sync disabled).
// Callers should null-check `redis` itself (not a separate boolean) so
// TypeScript can narrow it — see rateLimit.ts and api/sync/route.ts.
const upstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN

export const redis = upstashConfigured ? Redis.fromEnv() : null
