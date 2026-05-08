'use client'

export default function Error({ reset }) {
  return (
    <div className="page error-page">
      <div className="error-page-inner">
        <p className="error-page-code">ERROR</p>
        <h1 className="error-page-title">Algo salió mal</h1>
        <p className="error-page-sub">
          Ha ocurrido un error inesperado. Puedes intentar recuperarte sin recargar la página.
        </p>
        <div className="error-page-actions">
          <button
            className="btn-generate state-2"
            style={{ maxWidth: 240 }}
            onClick={reset}
          >
            → Intentar de nuevo
          </button>
          <button
            className="btn-reset"
            style={{ maxWidth: 240 }}
            onClick={() => window.location.reload()}
          >
            ↺ Recargar página
          </button>
        </div>
      </div>
    </div>
  )
}
