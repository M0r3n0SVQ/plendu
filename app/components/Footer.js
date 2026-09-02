import Link from 'next/link'

// Shared by every page's footer — each page just hides the link to itself.
export default function Footer({ showGuias = true, showPrivacidad = true }) {
  return (
    <footer className="footer">
      <span className="footer-logo">Plendu</span>
      <span>
        Hecho para vendedores reales · 2026
        {showGuias && (
          <>
            {' · '}
            <Link href="/guias" className="footer-link">Guías</Link>
          </>
        )}
        {showPrivacidad && (
          <>
            {' · '}
            <Link href="/privacidad" className="footer-link">Privacidad</Link>
          </>
        )}
        {' · '}
        <a href="mailto:alvaromorenofp@gmail.com?subject=Fallo%20en%20Plendu" className="footer-link">Reportar fallo</a>
      </span>
    </footer>
  )
}
