'use client'

export default function EmptyPanel({ historial, onSelectHistorial, onDeleteHistorial, onClearHistorial, onExportHistorial, onToggleVendida, onOpenSync, syncCode }) {
  if (historial.length === 0) {
    return (
      <div className="col-right-empty no-historial">
        <div className="col-right-empty-icon">◈</div>
        <p className="col-right-empty-title">Tu ficha aparecerá aquí</p>
        <p className="col-right-empty-sub">
          Sube una foto y pulsa generar para ver el resultado
        </p>
        <button className="sync-empty-link" onClick={onOpenSync}>
          {syncCode ? '⟳ Sincronización activa' : '⟳ ¿Ya tienes historial en otro dispositivo?'}
        </button>
      </div>
    )
  }

  return (
    <div className="historial">
      <div className="historial-header">
        <span className="historial-title">HISTORIAL</span>
        <div className="historial-header-right">
          <span className="historial-count">{historial.length} prendas</span>
          <button
            className={`historial-sync-btn${syncCode ? ' is-active' : ''}`}
            onClick={onOpenSync}
            aria-label={syncCode ? 'Gestionar sincronización' : 'Sincronizar entre dispositivos'}
            title={syncCode ? 'Sincronización activa' : 'Sincronizar entre dispositivos'}
          >
            ⟳
          </button>
          {historial.length > 0 && (
            <>
              <button
                className="historial-export-btn"
                onClick={onExportHistorial}
                aria-label="Exportar historial a CSV"
              >
                EXPORTAR
              </button>
              <button
                className="historial-clear-btn"
                onClick={onClearHistorial}
                aria-label="Borrar todo el historial"
              >
                BORRAR TODO
              </button>
            </>
          )}
        </div>
      </div>
      <ul className="historial-list" role="list">
        {historial.map((item) => (
          <li key={item.id} className={`historial-item-wrap${item.vendida ? ' vendida' : ''}`}>
            <button
              className="historial-item"
              onClick={() => onSelectHistorial(item)}
            >
              <div className="historial-item-left">
                {item.thumbnail ? (
                  <>
                    <img
                      src={item.thumbnail}
                      alt={`Miniatura de ${item.ficha.titulo}`}
                      className="historial-thumb"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling.style.display = 'flex'
                      }}
                    />
                    <div className="historial-thumb-placeholder" aria-hidden="true" style={{ display: 'none' }}>◈</div>
                  </>
                ) : (
                  <div className="historial-thumb-placeholder" aria-hidden="true">◈</div>
                )}
                <div className="historial-item-info">
                  <p className="historial-item-titulo">{item.ficha.titulo}</p>
                  <p className="historial-item-meta">
                    {item.ficha.precio}€
                    {item.ficha.marca ? ` · ${item.ficha.marca}` : ''}
                    {item.ficha.talla ? ` · ${item.ficha.talla}` : ''}
                    {item.vendida ? ' · VENDIDA' : ''}
                  </p>
                </div>
              </div>
              <span className="historial-item-date">{item.fecha}</span>
            </button>
            <button
              className={`historial-item-vendida${item.vendida ? ' is-vendida' : ''}`}
              onClick={() => onToggleVendida(item.id)}
              aria-label={item.vendida ? `Desmarcar "${item.ficha.titulo}" como vendida` : `Marcar "${item.ficha.titulo}" como vendida`}
              title={item.vendida ? 'Vendida — pulsa para desmarcar' : 'Marcar como vendida'}
            >
              ✓
            </button>
            <button
              className="historial-item-delete"
              onClick={() => onDeleteHistorial(item.id)}
              aria-label={`Eliminar "${item.ficha.titulo}" del historial`}
              title="Eliminar"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
