import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
}

// Forwards request errors (route handlers, server components) to Sentry.
export const onRequestError = Sentry.captureRequestError
