// The domain this deployment is actually reachable at. Defaults to the real
// Vercel URL rather than the reserved-but-not-yet-DNS-pointed plendu.app, so
// metadataBase/canonical/sitemap/robots always point somewhere that actually
// resolves. Once plendu.app is registered and pointed at this deployment,
// set NEXT_PUBLIC_SITE_URL=https://plendu.app in Vercel and every one of
// those updates automatically — no code change needed.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://plendu.vercel.app'
