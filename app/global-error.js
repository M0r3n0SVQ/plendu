'use client'

export default function GlobalError({ reset }) {
  return (
    <html lang="es">
      <body
        style={{
          background: '#080808',
          color: '#f2ede4',
          fontFamily: 'sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          textAlign: 'center',
          padding: '2rem',
          margin: 0,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              letterSpacing: '0.25em',
              color: '#b8965a',
              marginBottom: '1rem',
            }}
          >
            ERROR CRÍTICO
          </p>
          <h1
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: '2rem',
              fontWeight: 700,
              marginBottom: '0.75rem',
            }}
          >
            Error fatal
          </h1>
          <p
            style={{
              color: '#8a8580',
              fontSize: '0.88rem',
              lineHeight: 1.7,
              maxWidth: 280,
              margin: '0 auto 1.75rem',
            }}
          >
            La aplicación ha fallado de forma crítica. Recarga la página para continuar.
          </p>
          <button
            style={{
              padding: '0.75rem 2rem',
              background: '#b8965a',
              color: '#080808',
              border: 'none',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              marginRight: '0.75rem',
            }}
            onClick={reset}
          >
            Reiniciar
          </button>
          <button
            style={{
              padding: '0.75rem 2rem',
              background: 'transparent',
              color: '#8a8580',
              border: '1px solid rgba(242,237,228,0.1)',
              borderRadius: 12,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  )
}
