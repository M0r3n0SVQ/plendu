'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const SLOTS = [
  { key: 'principal', label: 'Principal', icon: '⊡', required: true,  hint: 'foto frontal',  gridClass: 'slot-principal' },
  { key: 'etiqueta',  label: 'Etiqueta',  icon: '◈', required: false, hint: 'marca / talla', gridClass: 'slot-secondary' },
  { key: 'trasera',   label: 'Trasera',   icon: '◧', required: false, hint: 'parte trasera', gridClass: 'slot-secondary' },
  { key: 'detalle',   label: 'Detalle',   icon: '◎', required: false, hint: 'primer plano',  gridClass: 'slot-secondary' },
]

const MAX_MB = 5
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const HISTORIAL_KEY = 'plendu_historial'
const MAX_HISTORIAL = 10

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.onerror = () => reject(new Error('Error al leer el archivo'))
    r.readAsDataURL(file)
  })
}

// Generate a compact base64 thumbnail using canvas (survives page reloads)
function generateThumbnail(blobUrl, maxSize = 120) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1)
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.65))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })
}

// Clipboard with execCommand fallback for http/restricted contexts
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      ok ? resolve() : reject(new Error('execCommand failed'))
    } catch (e) {
      reject(e)
    }
  })
}

function loadHistorial() {
  try {
    return JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]')
  } catch {
    return []
  }
}

function saveHistorial(items) {
  try {
    localStorage.setItem(HISTORIAL_KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

/* ─── Toast ──────────────────────────────── */
function Toast({ message, type, onDone, duration = 3000 }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])
  return <div className={`toast ${type}`}>{message}</div>
}

/* ─── Empty state ────────────────────────── */
function EmptyPanel({ historial, onSelectHistorial, onDeleteHistorial }) {
  if (historial.length === 0) {
    return (
      <div className="col-right-empty">
        <div className="col-right-empty-icon">◈</div>
        <p className="col-right-empty-title">Tu ficha aparecerá aquí</p>
        <p className="col-right-empty-sub">
          Sube una foto y pulsa generar para ver el resultado
        </p>
      </div>
    )
  }

  return (
    <div className="historial">
      <div className="historial-header">
        <span className="historial-title">HISTORIAL</span>
        <span className="historial-count">{historial.length} prendas</span>
      </div>
      <ul className="historial-list" role="list">
        {historial.map((item) => (
          <li key={item.id} className="historial-item-wrap">
            <button
              className="historial-item"
              onClick={() => onSelectHistorial(item)}
            >
              <div className="historial-item-left">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={`Miniatura de ${item.ficha.titulo}`}
                    className="historial-thumb"
                  />
                ) : (
                  <div className="historial-thumb-placeholder" aria-hidden="true">◈</div>
                )}
                <div className="historial-item-info">
                  <p className="historial-item-titulo">{item.ficha.titulo}</p>
                  <p className="historial-item-meta">
                    {item.ficha.precio}€
                    {item.ficha.marca ? ` · ${item.ficha.marca}` : ''}
                    {item.ficha.talla ? ` · ${item.ficha.talla}` : ''}
                  </p>
                </div>
              </div>
              <span className="historial-item-date">{item.fecha}</span>
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

/* ─── Skeleton shimmer ───────────────────── */
function SkeletonPanel() {
  return (
    <div className="skeleton-wrap">
      <div className="skeleton-header">
        <div className="skeleton-status">
          <span className="skeleton-dot" />
          <div className="sk" style={{ width: 110, height: 10 }} />
        </div>
        <div className="sk sk-pill" style={{ width: 70, height: 20 }} />
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '1.25rem 0' }} />
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <div className="sk" style={{ width: 45, height: 8 }} />
          <div className="sk sk-pill" style={{ width: 55, height: 20 }} />
        </div>
        <div className="sk" style={{ width: '95%', height: 11, marginBottom: 6 }} />
        <div className="sk" style={{ width: '70%', height: 11 }} />
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '1.25rem 0' }} />
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <div className="sk" style={{ width: 75, height: 8 }} />
          <div className="sk sk-pill" style={{ width: 55, height: 20 }} />
        </div>
        {[95, 88, 92, 60].map((w, i) => (
          <div key={i} className="sk" style={{ width: `${w}%`, height: 11, marginBottom: i < 3 ? 6 : 0 }} />
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '1.25rem 0' }} />
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[48, 72, 65, 55, 45].map((w, i) => (
          <div key={i} className="sk sk-pill" style={{ width: w, height: 26 }} />
        ))}
      </div>
      <div className="sk" style={{ width: '100%', height: 42, borderRadius: 12, marginBottom: 8 }} />
      <div className="sk" style={{ width: '100%', height: 36, borderRadius: 12 }} />
    </div>
  )
}

/* ─── Ficha generada ─────────────────────── */
function FichaPanel({ ficha, thumbnail, onReset, onVolver, hayHistorial }) {
  const [copiado, setCopiado] = useState(null)
  const [copiadoTodo, setCopiadoTodo] = useState(false)

  const copiar = useCallback((texto, campo) => {
    copyToClipboard(texto)
      .then(() => {
        setCopiado(campo)
        setTimeout(() => setCopiado(null), 2000)
      })
      .catch(() => {}) // silent — browser may block clipboard in some contexts
  }, [])

  const copiarTodo = useCallback(() => {
    const texto = [
      `TÍTULO: ${ficha.titulo}`,
      `\nDESCRIPCIÓN:\n${ficha.descripcion}`,
      `\nPRECIO: ${ficha.precio}€`,
      ficha.estado    ? `ESTADO: ${ficha.estado}`       : '',
      ficha.categoria ? `CATEGORÍA: ${ficha.categoria}` : '',
      ficha.marca     ? `MARCA: ${ficha.marca}`         : '',
      ficha.talla     ? `TALLA: ${ficha.talla}`         : '',
    ].filter(Boolean).join('\n')

    copyToClipboard(texto)
      .then(() => {
        setCopiadoTodo(true)
        setTimeout(() => setCopiadoTodo(false), 2000)
      })
      .catch(() => {})
  }, [ficha])

  const tags = [
    { label: `${ficha.precio}€`, accent: true },
    { label: ficha.estado },
    { label: ficha.categoria },
    { label: ficha.marca },
    { label: ficha.talla },
  ].filter(t => t.label)

  return (
    <div className="ficha">
      {thumbnail && (
        <div className="ficha-thumbnail-wrap">
          <img src={thumbnail} alt="Vista previa de la prenda" className="ficha-thumbnail" />
          <div className="ficha-thumbnail-overlay" />
        </div>
      )}

      <div className="ficha-header">
        <div className="ficha-status">
          <span className="ficha-status-dot" />
          <span className="ficha-status-text">FICHA GENERADA</span>
        </div>
        <span className="ficha-model-tag">GPT-4o mini</span>
      </div>

      <div className="ficha-divider" />

      {[
        { key: 'titulo',      label: 'TÍTULO',      value: ficha.titulo },
        { key: 'descripcion', label: 'DESCRIPCIÓN', value: ficha.descripcion },
      ].map(({ key, label, value }) => (
        <div key={key}>
          <div className="ficha-field">
            <div className="ficha-field-header">
              <span className="ficha-field-label">{label}</span>
              <button
                className={`btn-copy${copiado === key ? ' copied' : ''}`}
                onClick={() => copiar(value, key)}
                aria-label={copiado === key ? 'Copiado al portapapeles' : `Copiar ${label.toLowerCase()}`}
              >
                {copiado === key ? '✓ COPIADO' : 'COPIAR'}
              </button>
            </div>
            <p className="ficha-field-value">{value}</p>
          </div>
          <div className="ficha-divider" />
        </div>
      ))}

      <div className="ficha-tags">
        {tags.map(({ label, accent }) => (
          <span key={label} className={`tag${accent ? ' accent' : ''}`}>
            {label}
          </span>
        ))}
      </div>

      <button
        className={`btn-copy-all${copiadoTodo ? ' copied' : ''}`}
        onClick={copiarTodo}
        aria-label={copiadoTodo ? 'Todo copiado al portapapeles' : 'Copiar toda la ficha al portapapeles'}
      >
        {copiadoTodo ? '✓ TODO COPIADO' : '⊞ COPIAR TODO'}
      </button>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button className="btn-reset" style={{ flex: 1 }} onClick={onReset}>
          ↺ NUEVA PRENDA
        </button>
        {hayHistorial && (
          <button className="btn-reset" style={{ flex: 1 }} onClick={onVolver}>
            ← HISTORIAL
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Main component ─────────────────────── */
export default function ImageUploader() {
  const [fotos, setFotos]           = useState({})
  const [ficha, setFicha]           = useState(null)
  const [thumbnail, setThumbnail]   = useState(null)
  const [cargando, setCargando]     = useState(false)
  const [toast, setToast]           = useState(null)
  const [dragging, setDragging]     = useState(null)
  const [portalTarget, setPortalTarget] = useState(null)
  const [historial, setHistorial]   = useState([])

  useEffect(() => {
    setPortalTarget(document.getElementById('resultado-col'))
    setHistorial(loadHistorial())
  }, [])

  const numFotos = Object.keys(fotos).length
  const btnState = numFotos === 4 ? 'state-3' : numFotos >= 2 ? 'state-2' : 'state-1'

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type })
  }, [])

  const processFile = useCallback(async (file, key) => {
    if (!ALLOWED.includes(file.type)) {
      showToast('Formato no soportado. Usa JPG, PNG o WebP.')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      showToast(`Imagen demasiado grande. Máximo ${MAX_MB}MB.`)
      return
    }
    setFotos(prev => {
      if (prev[key]?.url) URL.revokeObjectURL(prev[key].url)
      return prev
    })
    const url = URL.createObjectURL(file)
    try {
      const base64 = await fileToBase64(file)
      setFotos(prev => ({ ...prev, [key]: { url, base64, mime: file.type } }))
      setFicha(null)
      setThumbnail(null)
    } catch {
      URL.revokeObjectURL(url)
      showToast('No se pudo procesar la imagen.')
    }
  }, [showToast])

  const handleFileInput = useCallback((e, key) => {
    const file = e.target.files[0]
    if (file) processFile(file, key)
  }, [processFile])

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault()
    setDragging(key)
  }, [])

  const handleDragLeave = useCallback(() => setDragging(null), [])

  const handleDrop = useCallback((e, key) => {
    e.preventDefault()
    setDragging(null)
    const files = Array.from(e.dataTransfer.files).filter(f => ALLOWED.includes(f.type))
    if (files.length === 0) return

    if (files.length === 1) {
      processFile(files[0], key)
      return
    }

    // Multi-file drop: fill the dropped slot first, then empty subsequent slots
    const order = SLOTS.map(s => s.key)
    const startIdx = order.indexOf(key)
    const targets = [key, ...order.slice(startIdx + 1).filter(k => !fotos[k])]
      .slice(0, files.length)
    files.slice(0, targets.length).forEach((file, i) => processFile(file, targets[i]))
  }, [processFile, fotos])

  const analizar = useCallback(async () => {
    if (!fotos.principal || cargando) return
    setCargando(true)
    setFicha(null)

    try {
      const makeFotoPayload = (f) =>
        f?.base64 ? { data: f.base64, mime: f.mime || 'image/jpeg' } : null

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fotos: {
            principal: makeFotoPayload(fotos.principal),
            etiqueta:  makeFotoPayload(fotos.etiqueta),
            trasera:   makeFotoPayload(fotos.trasera),
            detalle:   makeFotoPayload(fotos.detalle),
          },
        }),
      })

      // Always parse JSON — server returns { error } on failure
      let data
      try {
        data = await res.json()
      } catch {
        throw new Error(`Error ${res.status}. Inténtalo de nuevo.`)
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `Error ${res.status}. Inténtalo de nuevo.`)
      }

      // Generate a persistent base64 thumbnail for localStorage
      const thumbBase64 = await generateThumbnail(fotos.principal.url)

      setThumbnail(fotos.principal.url) // blob URL for immediate crisp display
      setFicha(data)

      const now = new Date()
      const fecha = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
      const entrada = {
        id: Date.now(),
        fecha,
        ficha: data,
        thumbnail: thumbBase64, // base64 — persists across reloads
      }

      const nuevo = [entrada, ...historial].slice(0, MAX_HISTORIAL)
      setHistorial(nuevo)
      if (!saveHistorial(nuevo)) {
        showToast('No se pudo guardar en historial.', 'error')
      }

    } catch (err) {
      showToast(err.message || 'Error inesperado.')
    } finally {
      setCargando(false)
    }
  }, [fotos, cargando, historial, showToast])

  const reset = useCallback(() => {
    Object.values(fotos).forEach(f => f?.url && URL.revokeObjectURL(f.url))
    setFotos({})
    setFicha(null)
    setThumbnail(null)
  }, [fotos])

  const volverAlHistorial = useCallback(() => {
    setFicha(null)
    setThumbnail(null)
  }, [])

  const selectHistorial = useCallback((item) => {
    setFicha(item.ficha)
    setThumbnail(item.thumbnail) // base64 data URL — valid after reload
  }, [])

  const deleteHistorial = useCallback((id) => {
    const nuevo = historial.filter(item => item.id !== id)
    setHistorial(nuevo)
    saveHistorial(nuevo)
  }, [historial])

  const rightPanel = () => {
    if (cargando) return <SkeletonPanel />
    if (ficha) return (
      <FichaPanel
        ficha={ficha}
        thumbnail={thumbnail}
        onReset={reset}
        onVolver={volverAlHistorial}
        hayHistorial={historial.length > 0}
      />
    )
    return (
      <EmptyPanel
        historial={historial}
        onSelectHistorial={selectHistorial}
        onDeleteHistorial={deleteHistorial}
      />
    )
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.type === 'error' ? 5000 : 3000}
          onDone={() => setToast(null)}
        />
      )}

      <div className="uploader">
        <div className="foto-count">
          <span className="foto-count-label">FOTOS AÑADIDAS</span>
          <span className="foto-count-num">{numFotos} / 4</span>
        </div>
        <div className="foto-progress">
          <div
            className="foto-progress-fill"
            style={{ width: `${(numFotos / 4) * 100}%` }}
          />
        </div>

        <div className="foto-grid">
          {SLOTS.map(({ key, label, icon, required, hint, gridClass }) => {
            const filled = !!fotos[key]
            const isDraggingThis = dragging === key
            return (
              <label
                key={key}
                className={`foto-slot ${gridClass}${filled ? ' filled' : ''}${isDraggingThis ? ' is-dragging' : ''}`}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, key)}
              >
                {filled ? (
                  <>
                    <img
                      src={fotos[key].url}
                      alt={`Foto ${label.toLowerCase()} de la prenda`}
                      className="foto-preview"
                      style={{ animation: 'fotoEnter 0.25s cubic-bezier(0.16,1,0.3,1)' }}
                    />
                    <div className="foto-overlay">
                      <span className="foto-overlay-text">CAMBIAR FOTO</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="foto-icon" aria-hidden="true">{icon}</span>
                    <span className="foto-label">{label}</span>
                    <span className="foto-sub">{hint}</span>
                    {required && <span className="foto-required-badge">OBLIGATORIA</span>}
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileInput(e, key)}
                />
              </label>
            )
          })}
        </div>

        {fotos.principal && (
          <button
            className={`btn-generate ${btnState} btn-enter`}
            onClick={analizar}
            disabled={cargando}
            aria-busy={cargando}
            aria-label={cargando ? 'Analizando prenda, por favor espera' : 'Generar ficha para Vinted'}
          >
            {cargando ? (
              <>
                <span className="spinner" aria-hidden="true" />
                ANALIZANDO PRENDA...
              </>
            ) : (
              <>
                <span aria-hidden="true">→</span>
                {numFotos === 4 ? 'GENERAR FICHA COMPLETA' : 'GENERAR FICHA'}
              </>
            )}
          </button>
        )}
      </div>

      {portalTarget && createPortal(rightPanel(), portalTarget)}

      {!portalTarget && (ficha || cargando) && (
        <div style={{ marginTop: '1.5rem' }}>
          {rightPanel()}
        </div>
      )}
    </>
  )
}
