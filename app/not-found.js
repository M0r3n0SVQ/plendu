import Link from 'next/link'

export const metadata = {
  title: 'Página no encontrada — Plendu',
}

export default function NotFound() {
  return (
    <div className="page error-page">
      <div className="error-page-inner">
        <p className="error-page-code">404</p>
        <h1 className="error-page-title">Página no encontrada</h1>
        <p className="error-page-sub">
          La página que buscas no existe o ha sido movida.
        </p>
        <div className="error-page-actions">
          <Link
            href="/"
            className="btn-generate state-2"
            style={{ maxWidth: 220, textDecoration: 'none' }}
          >
            → Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
