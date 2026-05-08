import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export function GET(request) {
  const { searchParams } = new URL(request.url)
  const size = Math.min(512, Math.max(16, parseInt(searchParams.get('size') || '192')))

  // Padding for maskable safe zone (10% on each side)
  const pad = Math.round(size * 0.1)
  const inner = size - pad * 2

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
        }}
      >
        {/* Gold circle backdrop */}
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #c8a86a, #b8965a 60%, #8a6e3a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'serif',
              fontSize: Math.round(inner * 0.52),
              fontWeight: 700,
              color: '#080808',
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            P
          </div>
        </div>
      </div>
    ),
    { width: size, height: size }
  )
  // Cache icon for 1 year — content only changes on code deploy
  imageResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return imageResponse
}
