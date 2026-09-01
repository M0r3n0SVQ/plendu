import Link from 'next/link'

export default function GuiasLayout({ children }) {
  return (
    <div className="page">
      <header className="header">
        <Link href="/" className="logo" aria-label="Volver a Plendu">
          Plendu
          <span className="logo-dot" aria-hidden="true" />
        </Link>
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            letterSpacing: '0.12em',
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          ← VOLVER
        </Link>
      </header>

      {children}

      <footer className="footer">
        <span className="footer-logo">Plendu</span>
        <span>
          Hecho para vendedores reales · 2026
          {' · '}
          <Link href="/privacidad" className="footer-link">Privacidad</Link>
        </span>
      </footer>
    </div>
  )
}
