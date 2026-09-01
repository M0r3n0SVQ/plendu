/** @type {import('next').NextConfig} */

import { withSentryConfig } from '@sentry/nextjs'

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer information
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features not used by the app (comprehensive policy)
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=()',
      'fullscreen=()',
      'geolocation=()',
      'gyroscope=()',
      'interest-cohort=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  },
  // Force HTTPS (only effective when served over HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Prevent cross-origin attacks via window.opener
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Prevent this app's resources from being loaded cross-origin
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Legacy cross-domain policy (Flash/PDF readers)
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  // Content Security Policy
  // Note: 'unsafe-inline' for script-src is required by the hardcoded inline scripts
  // in layout.js (theme init + SW registration). These scripts contain no user input.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // va.vercel-scripts.com serves the Vercel Analytics script — in
      // production this is proxied same-origin, but local/preview builds
      // (this one included) load it directly from that domain.
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      // data: for base64 thumbnails stored in localStorage; blob: for object URLs
      "img-src 'self' data: blob:",
      // API calls: own server + Sentry ingest (errors) + Vercel Analytics beacons.
      // OpenAI is called server-side, never from the browser. blob: is for
      // re-reading canvas output (photo crop/rotate) — these URLs can only
      // ever point to something this page itself created, never a remote host.
      "connect-src 'self' blob: https://*.ingest.sentry.io https://*.sentry.io https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

// Sentry wrapper — only mutates the build when SENTRY_AUTH_TOKEN is present
// (uploads sourcemaps). Without it, build behaves normally.
export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent:  !process.env.CI,
  // Hide sourcemaps from public access — we still upload them to Sentry.
  hideSourceMaps:    true,
  disableLogger:     true,
  // Don't fail the build if sourcemap upload fails (e.g. token missing).
  errorHandler: () => {},
})
