import Link from 'next/link'
import Footer from '../components/Footer'

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

      <Footer showGuias={false} />
    </div>
  )
}
