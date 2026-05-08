import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Plendu — Fichas para Vinted en segundos'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#080808',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gold orb top-right */}
        <div
          style={{
            position: 'absolute',
            width: 800,
            height: 800,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(184,150,90,0.18) 0%, transparent 65%)',
            top: -300,
            right: -200,
          }}
        />
        {/* Subtle orb bottom-left */}
        <div
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(184,150,90,0.07) 0%, transparent 65%)',
            bottom: -200,
            left: -100,
          }}
        />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 28 }}>
          <span
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 88,
              fontWeight: 700,
              color: '#f2ede4',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}
          >
            Plendu
          </span>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#b8965a',
              marginLeft: 5,
              marginBottom: 16,
            }}
          />
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: 'sans-serif',
            fontSize: 30,
            color: '#8a8580',
            margin: '0 0 48px',
            letterSpacing: '0.01em',
          }}
        >
          Fichas para Vinted en segundos
        </p>

        {/* Pills row */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['IA GPT-4o', 'Gratis', '< 10 segundos'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                background: 'rgba(184,150,90,0.12)',
                border: '1px solid rgba(184,150,90,0.3)',
                borderRadius: 100,
                padding: '10px 24px',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 18,
                  color: '#b8965a',
                  letterSpacing: '0.1em',
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
