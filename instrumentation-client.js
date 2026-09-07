import * as Sentry from '@sentry/nextjs'

// No-ops gracefully if NEXT_PUBLIC_SENTRY_DSN is unset.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
    // Sample errors fully, traces lightly.
    tracesSampleRate: 0.1,
    // Replays cost quota fast on the free plan — disabled for now.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Skip noisy browser extensions / known unactionable errors.
    ignoreErrors: [
      // Network blips when the user closes the tab mid-fetch
      'AbortError',
      'Load failed',
      // Service worker registration warnings
      'SW registration failed',
      // Crypto wallet browser extensions (MetaMask etc.) inject a provider
      // into every page a visitor loads — this app has no web3 code, so
      // any EIP-1193 provider error is the extension's own noise, not ours.
      'provider is disconnected from all chains',
    ],
  })
}

// Required by Next.js 16 for navigation transactions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
