import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
          borderRadius: 7,
        }}
      >
        <div
          style={{
            fontFamily: 'serif',
            fontSize: 20,
            fontWeight: 700,
            color: '#b8965a',
            lineHeight: 1,
          }}
        >
          P
        </div>
      </div>
    ),
    { width: 32, height: 32 }
  )
}
