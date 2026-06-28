import * as Sentry from '@sentry/nextjs'

// No-ops gracefully if NEXT_PUBLIC_SENTRY_DSN is unset (local dev / fork).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    // Sample 100 % of errors but only 10 % of transactions — enough to spot
    // slow OpenAI calls without burning the free quota.
    tracesSampleRate: 0.1,
    // Don't capture spammy 4xx that we already handle by design.
    ignoreErrors: [
      'Demasiadas peticiones. Espera un momento.',
      'Petición demasiado grande.',
      'Petición inválida.',
    ],
  })
}
