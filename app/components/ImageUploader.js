'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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

const ESTADO_OPTIONS = [
  'Nuevo con etiquetas',
  'Nuevo sin etiquetas',
  'Muy bueno',
  'Bueno',
  'Satisfactorio',
]

const TALLA_OPTIONS = [
  // Letter sizes
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  // Numeric clothing
  '34', '36', '38', '40', '42', '44', '46', '48',
  // Shoe sizes
  '35', '37', '39', '41', '43', '45', '47',
  // Jeans waist
  '28', '30', '32',
  // Kids
  '2 años', '4 años', '6 años', '8 años', '10 años', '12 años', '14 años',
]

const CATEGORIA_OPTIONS = [
  // Mujer
  'Camisetas y tops', 'Camisas y blusas', 'Jerseys y sudaderas', 'Vestidos',
  'Faldas', 'Pantalones', 'Vaqueros', 'Chaquetas y abrigos', 'Ropa de deporte',
  'Ropa interior', 'Bañadores', 'Trajes y conjuntos', 'Calzado mujer',
  'Bolsos', 'Accesorios mujer',
  // Hombre
  'Camisetas', 'Camisas', 'Jerseys y sudaderas hombre', 'Pantalones hombre',
  'Vaqueros hombre', 'Chaquetas y abrigos hombre', 'Ropa de deporte hombre',
  'Calzado hombre', 'Accesorios hombre',
  // Niños
  'Ropa niña', 'Ropa niño', 'Calzado niños', 'Accesorios niños',
]

// ─── Image compression ────────────────────────────────────────────────────────
// Resize to max 1024px and encode as JPEG 0.82 before sending to the API.
// Reduces typical 3-5 MB photos to ~80-200 KB — 10-20× less data.
function compressImage(file, maxDim = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(tempUrl)
      try {
        const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1)
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        // Release canvas memory
        canvas.width = 0
        canvas.height = 0
        resolve(dataUrl.split(',')[1]) // return base64 part only
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl)
      reject(new Error('Error al cargar la imagen'))
    }
    img.src = tempUrl
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65)
        canvas.width = 0
        canvas.height = 0
        resolve(dataUrl)
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

const FICHA_FIELD_MAX_LEN = 1000  // bumped to fit emoji descriptions
const MEDIDAS_MAX_LEN     = 100

function sanitizeFicha(raw) {
  if (!raw || typeof raw !== 'object') return null
  const safe = {}
  for (const f of ['titulo', 'descripcion', 'estado', 'categoria', 'marca', 'talla']) {
    if (typeof raw[f] === 'string') safe[f] = raw[f].slice(0, FICHA_FIELD_MAX_LEN)
  }
  if (typeof raw.medidas === 'string') safe.medidas = raw.medidas.slice(0, MEDIDAS_MAX_LEN)
  if (typeof raw.precio === 'number' && isFinite(raw.precio)) safe.precio = raw.precio
  return safe
}

function loadHistorial() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .map(item => {
        if (!item || typeof item !== 'object') return null
        if (typeof item.id !== 'number')      return null
        if (typeof item.fecha !== 'string')   return null
        const ficha = sanitizeFicha(item.ficha)
        if (!ficha) return null
        // Only allow base64 data URLs — reject blob: and any other scheme
        const thumbnail = (
          typeof item.thumbnail === 'string' &&
          item.thumbnail.startsWith('data:image/') &&
          item.thumbnail.length < 200_000
        ) ? item.thumbnail : null
        return {
          id:        item.id,
          fecha:     item.fecha.slice(0, 20),
          ficha,
          thumbnail,
        }
      })
      .filter(Boolean)
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
function Toast({ message, type, onDone, duration = 3000, action, onAction }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])

  return (
    <div
      className={`toast ${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <span>{message}</span>
      {action && onAction && (
        <button
          className="toast-action"
          onClick={() => { onAction(); onDone() }}
        >
          {action}
        </button>
      )}
    </div>
  )
}

/* ─── Empty state ────────────────────────── */
function EmptyPanel({ historial, onSelectHistorial, onDeleteHistorial, onClearHistorial }) {
  if (historial.length === 0) {
    return (
      <div className="col-right-empty no-historial">
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
        <div className="historial-header-right">
          <span className="historial-count">{historial.length} prendas</span>
          {historial.length > 0 && (
            <button
              className="historial-clear-btn"
              onClick={onClearHistorial}
              aria-label="Borrar todo el historial"
            >
              BORRAR TODO
            </button>
          )}
        </div>
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
function FichaPanel({
  ficha: fichaInit, thumbnail, onReset, onVolver, onRegenerar,
  hayHistorial, showToast, medidas, onMedidasChange,
}) {
  const [ficha, setFicha]             = useState(fichaInit)
  const [editando, setEditando]       = useState(null)   // 'titulo' | 'descripcion'
  const [draft, setDraft]             = useState('')
  const [copiado, setCopiado]         = useState(null)
  const [copiadoTodo, setCopiadoTodo] = useState(false)

  // Reload local ficha when a new ficha arrives (AI result or historial item)
  useEffect(() => { setFicha(fichaInit) }, [fichaInit])

  // Web Share API — only available on HTTPS + mobile browsers
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const startEdit = (key) => {
    setDraft(ficha[key] || '')
    setEditando(key)
  }

  const commitEdit = useCallback(() => {
    if (editando) {
      const trimmed = draft.trim()
      if (trimmed) setFicha(prev => ({ ...prev, [editando]: trimmed }))
    }
    setEditando(null)
  }, [editando, draft])

  const cancelEdit = () => setEditando(null)

  const copiar = useCallback((texto, campo) => {
    copyToClipboard(texto)
      .then(() => {
        setCopiado(campo)
        setTimeout(() => setCopiado(null), 2000)
      })
      .catch(() => showToast('No se pudo copiar al portapapeles.', 'error'))
  }, [showToast])

  const buildTexto = useCallback(() => {
    const desc = medidas.trim()
      ? ficha.descripcion.replace('(a completar)', medidas.trim())
      : ficha.descripcion
    return [
      `TÍTULO: ${ficha.titulo}`,
      `\nDESCRIPCIÓN:\n${desc}`,
      `\nPRECIO: ${ficha.precio}€`,
      ficha.estado    ? `ESTADO: ${ficha.estado}`       : '',
      ficha.categoria ? `CATEGORÍA: ${ficha.categoria}` : '',
      ficha.marca     ? `MARCA: ${ficha.marca}`         : '',
      ficha.talla     ? `TALLA: ${ficha.talla}`         : '',
    ].filter(Boolean).join('\n')
  }, [ficha, medidas])

  const copiarTodo = useCallback(() => {
    copyToClipboard(buildTexto())
      .then(() => {
        setCopiadoTodo(true)
        setTimeout(() => setCopiadoTodo(false), 2000)
      })
      .catch(() => showToast('No se pudo copiar al portapapeles.', 'error'))
  }, [buildTexto, showToast])

  const compartir = useCallback(async () => {
    if (!canShare) return
    try {
      const text = buildTexto()
      const shareData = { title: ficha.titulo, text }

      // Web Share Level 2: try to attach the principal photo if available.
      // thumbnail is a base64 data: URL, safe to fetch (no network).
      if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('data:image/')) {
        try {
          const blob = await (await fetch(thumbnail)).blob()
          const file = new File([blob], 'plendu-prenda.jpg', { type: blob.type || 'image/jpeg' })
          if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
            shareData.files = [file]
          }
        } catch { /* fall back to text-only share */ }
      }

      await navigator.share(shareData)
    } catch { /* user cancelled or API unsupported */ }
  }, [ficha.titulo, buildTexto, canShare, thumbnail])

  return (
    <div className="ficha">
      {thumbnail && (
        <div className="ficha-thumbnail-wrap">
          <img
            src={thumbnail}
            alt="Vista previa de la prenda"
            className="ficha-thumbnail"
            fetchPriority="high"
            decoding="async"
          />
          <div className="ficha-thumbnail-overlay" aria-hidden="true" />
        </div>
      )}

      <div className="ficha-header">
        <div className="ficha-status">
          <span className="ficha-status-dot" aria-hidden="true" />
          <span className="ficha-status-text">FICHA GENERADA</span>
        </div>
        <span className="ficha-model-tag" aria-label="Modelo: GPT-4o mini">GPT-4o mini</span>
      </div>

      <div className="ficha-divider" />

      {[
        { key: 'titulo',      label: 'TÍTULO',      value: ficha.titulo,      tipo: 'input'    },
        { key: 'descripcion', label: 'DESCRIPCIÓN', value: ficha.descripcion, tipo: 'textarea' },
      ].map(({ key, label, value, tipo }) => (
        <div key={key}>
          <div className="ficha-field">
            <div className="ficha-field-header">
              <span className="ficha-field-label">{label}</span>
              <div className="ficha-field-actions">
                {editando === key ? (
                  <>
                    <button className="btn-copy btn-guardar" onClick={commitEdit}>
                      ✓ GUARDAR
                    </button>
                    <button className="btn-copy btn-cancelar" onClick={cancelEdit}>
                      CANCELAR
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-copy btn-edit"
                      onClick={() => startEdit(key)}
                      aria-label={`Editar ${label.toLowerCase()}`}
                    >
                      EDITAR
                    </button>
                    <button
                      className={`btn-copy${copiado === key ? ' copied' : ''}`}
                      onClick={() => copiar(
                        key === 'descripcion' && medidas.trim()
                          ? value.replace('(a completar)', medidas.trim())
                          : value,
                        key
                      )}
                      aria-label={copiado === key ? 'Copiado al portapapeles' : `Copiar ${label.toLowerCase()}`}
                    >
                      {copiado === key ? '✓ COPIADO' : 'COPIAR'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {editando === key ? (
              tipo === 'input' ? (
                <input
                  className="ficha-field-edit"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  autoFocus
                  maxLength={80}
                />
              ) : (
                <textarea
                  className="ficha-field-edit"
                  value={draft}
                  onChange={e => {
                    setDraft(e.target.value)
                    // auto-resize
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                  autoFocus
                  rows={4}
                  maxLength={1000}
                />
              )
            ) : (
              <p className={`ficha-field-value${key === 'titulo' ? ' ficha-titulo-value' : ' ficha-desc-value'}`}>{value}</p>
            )}

            {key === 'titulo' && (
              <p className={`ficha-char-count${(editando === key ? draft : value).length > 80 ? ' over' : ''}`}>
                {(editando === key ? draft : value).length}/80 caracteres
                {(editando === key ? draft : value).length > 80 ? ' — demasiado largo' : ''}
              </p>
            )}
            {key === 'descripcion' && (
              <p className={`ficha-char-count${(editando === key ? draft : value).length > 800 ? ' over' : ''}`}>
                {(editando === key ? draft : value).length}/800 caracteres
                {(editando === key ? draft : value).length > 800 ? ' — puede ser demasiado larga' : ''}
              </p>
            )}
          </div>
          <div className="ficha-divider" />
        </div>
      ))}

      {/* Editable metadata grid */}
      <div className="ficha-meta">
        <div className="ficha-meta-field">
          <span className="ficha-meta-label">PRECIO</span>
          <div className="meta-precio-wrap">
            <input
              type="number"
              className="meta-input"
              value={ficha.precio ?? ''}
              min="0"
              max="9999"
              step="0.5"
              onChange={e => setFicha(prev => ({ ...prev, precio: Math.max(0, parseFloat(e.target.value) || 0) }))}
              aria-label="Precio en euros"
            />
            <span className="meta-precio-suffix">€</span>
          </div>
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">
            ESTADO
            {ficha.estado && (
              <span
                className={`estado-dot estado-dot--${
                  ['Nuevo con etiquetas', 'Nuevo sin etiquetas', 'Muy bueno'].includes(ficha.estado) ? 'green'
                  : ficha.estado === 'Bueno' ? 'yellow'
                  : ficha.estado === 'Satisfactorio' ? 'orange'
                  : 'gray'
                }`}
                aria-hidden="true"
              />
            )}
          </span>
          <select
            className="meta-input meta-select"
            value={ficha.estado || ''}
            onChange={e => setFicha(prev => ({ ...prev, estado: e.target.value }))}
            aria-label="Estado de la prenda"
          >
            <option value="">— elegir —</option>
            {ESTADO_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">CATEGORÍA</span>
          <input
            className="meta-input"
            value={ficha.categoria || ''}
            onChange={e => setFicha(prev => ({ ...prev, categoria: e.target.value.slice(0, 100) }))}
            placeholder="ej: Camisetas y tops"
            aria-label="Categoría de Vinted"
            list="vinted-categorias"
          />
          <datalist id="vinted-categorias">
            {CATEGORIA_OPTIONS.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">MARCA</span>
          <input
            className="meta-input"
            value={ficha.marca || ''}
            onChange={e => setFicha(prev => ({ ...prev, marca: e.target.value.slice(0, 100) }))}
            placeholder="ej: Nike"
            aria-label="Marca de la prenda"
          />
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">TALLA</span>
          <input
            className="meta-input"
            value={ficha.talla || ''}
            onChange={e => setFicha(prev => ({ ...prev, talla: e.target.value.slice(0, 50) }))}
            placeholder="ej: M"
            aria-label="Talla de la prenda"
            list="vinted-tallas"
          />
          <datalist id="vinted-tallas">
            {TALLA_OPTIONS.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        <div className="ficha-meta-field ficha-meta-field--wide">
          <span className="ficha-meta-label">MEDIDAS</span>
          <input
            className="meta-input"
            value={medidas}
            onChange={e => onMedidasChange(e.target.value.slice(0, MEDIDAS_MAX_LEN))}
            placeholder="ej: hombros 46 cm / largo 66 cm"
            aria-label="Medidas de la prenda en plano"
          />
        </div>
      </div>

      <div className="ficha-divider" />

      <div className="ficha-actions">
        <button
          className={`btn-copy-all${copiadoTodo ? ' copied' : ''}`}
          onClick={copiarTodo}
          aria-label={copiadoTodo ? 'Todo copiado al portapapeles' : 'Copiar toda la ficha al portapapeles'}
        >
          {copiadoTodo ? '✓ TODO COPIADO' : '⊞ COPIAR TODO'}
        </button>
        {canShare && (
          <button className="btn-share" onClick={compartir} aria-label="Compartir ficha">
            ↗ COMPARTIR
          </button>
        )}
      </div>

      {onRegenerar && (
        <button
          className="btn-reset btn-regenerar"
          style={{ width: '100%', marginTop: '0.75rem' }}
          onClick={onRegenerar}
          aria-label="Volver a analizar las mismas fotos"
          title="Vuelve a analizar las mismas fotos por si quieres otro resultado"
        >
          ↻ REGENERAR FICHA
        </button>
      )}

      {/* Batch mode hint — confirms the ficha is already saved before user resets */}
      <p className="batch-hint" aria-live="polite">
        ✓ Guardada en historial · pulsa NUEVA PRENDA para analizar otra
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
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
  const [fotos, setFotos]               = useState({})
  const [ficha, setFicha]               = useState(null)
  const [thumbnail, setThumbnail]       = useState(null)
  const [cargando, setCargando]         = useState(false)
  const [toast, setToast]               = useState(null)
  const [dragging, setDragging]         = useState(null)
  const [portalTarget, setPortalTarget] = useState(null)
  const [historial, setHistorial]       = useState([])
  const [medidas, setMedidas]           = useState('')

  const abortRef            = useRef(null)
  const hintTimerRef        = useRef(null)
  const currentEntryIdRef   = useRef(null)  // id of the historial entry shown

  useEffect(() => {
    setPortalTarget(document.getElementById('resultado-col'))
    setHistorial(loadHistorial())
    return () => {
      abortRef.current?.abort()
      clearTimeout(hintTimerRef.current)
    }
  }, [])

  const numFotos = Object.keys(fotos).length
  const isCompressing = Object.values(fotos).some(f => f?.compressing)
  const btnState = numFotos === 4 ? 'state-3' : numFotos >= 2 ? 'state-2' : 'state-1'

  const showToast = useCallback((message, type = 'error', action = null, onAction = null) => {
    setToast({ message, type, action, onAction })
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

    // Revoke previous blob for this slot
    setFotos(prev => {
      if (prev[key]?.url) URL.revokeObjectURL(prev[key].url)
      return prev
    })

    const url = URL.createObjectURL(file)

    // Show preview immediately — compression runs in background
    setFotos(prev => ({ ...prev, [key]: { url, base64: null, mime: 'image/jpeg', compressing: true } }))
    setFicha(null)
    setThumbnail(null)

    try {
      const base64 = await compressImage(file)
      setFotos(prev => {
        // If user replaced this slot before compression finished, discard
        if (prev[key]?.url !== url) { URL.revokeObjectURL(url); return prev }
        return { ...prev, [key]: { url, base64, mime: 'image/jpeg', compressing: false } }
      })
    } catch {
      URL.revokeObjectURL(url)
      setFotos(prev => { const { [key]: _, ...rest } = prev; return rest })
      showToast('No se pudo procesar la imagen.')
    }
  }, [showToast])

  const handleFileInput = useCallback((e, key) => {
    const file = e.target.files[0]
    if (file) processFile(file, key)
    // Reset so selecting the same file again triggers onChange
    e.target.value = ''
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

  // ── Paste from clipboard (Ctrl+V / ⌘V) ──────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e) => {
      if (cargando) return
      const items = Array.from(e.clipboardData?.items || [])
      const imageItem = items.find(item => item.type.startsWith('image/'))
      if (!imageItem) return
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (!file) return
      // Fill first empty slot, or overwrite principal if all are full
      const emptySlot = SLOTS.find(s => !fotos[s.key]) || SLOTS[0]
      showToast(`Foto "${emptySlot.label.toLowerCase()}" pegada desde portapapeles`, 'success')
      processFile(file, emptySlot.key)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [fotos, cargando, processFile, showToast])

  const analizar = useCallback(async () => {
    if (!fotos.principal || cargando || Object.values(fotos).some(f => f?.compressing)) return

    // Cancel any previous in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Auto-abort after 35s — prevents waiting forever on slow AI responses
    let timedOut = false
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort() }, 35_000)

    setCargando(true)
    setFicha(null)

    // On mobile: immediately scroll to result column so user sees the skeleton
    if (window.innerWidth <= 860) {
      const el = document.getElementById('resultado-col')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    try {
      const makeFotoPayload = (f) =>
        f?.base64 ? { data: f.base64, mime: f.mime || 'image/jpeg' } : null

      const res = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({
          fotos: {
            principal: makeFotoPayload(fotos.principal),
            etiqueta:  makeFotoPayload(fotos.etiqueta),
            trasera:   makeFotoPayload(fotos.trasera),
            detalle:   makeFotoPayload(fotos.detalle),
          },
        }),
      })

      let data
      try {
        data = await res.json()
      } catch {
        throw new Error(`Error ${res.status}. Inténtalo de nuevo.`)
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `Error ${res.status}. Inténtalo de nuevo.`)
      }

      const thumbBase64 = await generateThumbnail(fotos.principal.url)

      setThumbnail(fotos.principal.url)
      setFicha(data)

      // Contextual hints — shown after a short delay so the ficha renders first
      clearTimeout(hintTimerRef.current)
      hintTimerRef.current = setTimeout(() => {
        if (!data.marca && !data.talla) {
          showToast('Sin etiqueta visible — añade una foto de la etiqueta para mejor resultado', 'info')
        } else if (data.estado === 'Satisfactorio') {
          showToast('Estado Satisfactorio — recuerda fotografiar los defectos al publicar en Vinted', 'info')
        }
      }, 500)

      const now = new Date()
      const fecha = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
      const newId = Date.now()
      const entrada = {
        id: newId,
        fecha,
        ficha: data,
        thumbnail: thumbBase64,
      }

      // Track which historial entry is being shown so medidas edits sync to it
      currentEntryIdRef.current = newId
      setMedidas('')

      const nuevo = [entrada, ...historial].slice(0, MAX_HISTORIAL)
      setHistorial(nuevo)
      if (!saveHistorial(nuevo)) {
        showToast('No se pudo guardar en historial.', 'error')
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        if (timedOut) showToast('La IA tardó demasiado. Inténtalo de nuevo.')
        return
      }
      showToast(err.message || 'Error inesperado.')
    } finally {
      clearTimeout(timeoutId)
      setCargando(false)
    }
  }, [fotos, cargando, historial, showToast])

  // ── Enter key shortcut ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Enter' || e.isComposing) return
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(tag)) return
      analizar()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [analizar])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    clearTimeout(hintTimerRef.current)
    Object.values(fotos).forEach(f => f?.url && URL.revokeObjectURL(f.url))
    setFotos({})
    setFicha(null)
    setThumbnail(null)
    setCargando(false)
    setMedidas('')
    currentEntryIdRef.current = null
  }, [fotos])

  const volverAlHistorial = useCallback(() => {
    setFicha(null)
    setThumbnail(null)
    setMedidas('')
    currentEntryIdRef.current = null
  }, [])

  const selectHistorial = useCallback((item) => {
    setFicha(item.ficha)
    setThumbnail(item.thumbnail)
    setMedidas(typeof item.ficha.medidas === 'string' ? item.ficha.medidas : '')
    currentEntryIdRef.current = item.id
  }, [])

  // Persists medidas in the historial entry currently being viewed
  const updateMedidas = useCallback((value) => {
    setMedidas(value)
    const id = currentEntryIdRef.current
    if (id == null) return
    setHistorial(prev => {
      const next = prev.map(item =>
        item.id === id
          ? { ...item, ficha: { ...item.ficha, medidas: value } }
          : item
      )
      saveHistorial(next)
      return next
    })
  }, [])

  const deleteHistorial = useCallback((id) => {
    const item = historial.find(h => h.id === id)
    if (!item) return
    const nuevo = historial.filter(h => h.id !== id)
    setHistorial(nuevo)
    saveHistorial(nuevo)

    // Offer undo for 5 seconds
    const titulo = item.ficha.titulo
    showToast(
      `"${titulo.length > 22 ? titulo.slice(0, 22) + '…' : titulo}" eliminado`,
      'info',
      'DESHACER',
      () => {
        setHistorial(prev => {
          const restaurado = [item, ...prev]
            .sort((a, b) => b.id - a.id)
            .slice(0, MAX_HISTORIAL)
          saveHistorial(restaurado)
          return restaurado
        })
      }
    )
  }, [historial, showToast])

  const removeSlot = useCallback((key) => {
    setFotos(prev => {
      if (prev[key]?.url) URL.revokeObjectURL(prev[key].url)
      const { [key]: _, ...rest } = prev
      return rest
    })
    if (key === 'principal') {
      setFicha(null)
      setThumbnail(null)
    }
  }, [])

  const clearHistorial = useCallback(() => {
    const backup = [...historial]
    if (backup.length === 0) return
    setHistorial([])
    saveHistorial([])
    showToast(
      `${backup.length} ${backup.length === 1 ? 'prenda eliminada' : 'prendas eliminadas'}`,
      'info',
      'DESHACER',
      () => {
        setHistorial(backup)
        saveHistorial(backup)
      }
    )
  }, [historial, showToast])

  const rightPanel = () => {
    if (cargando) return <SkeletonPanel />
    if (ficha) return (
      <FichaPanel
        ficha={ficha}
        thumbnail={thumbnail}
        onReset={reset}
        onVolver={volverAlHistorial}
        onRegenerar={fotos.principal ? analizar : null}
        hayHistorial={historial.length > 0}
        showToast={showToast}
        medidas={medidas}
        onMedidasChange={updateMedidas}
      />
    )
    return (
      <EmptyPanel
        historial={historial}
        onSelectHistorial={selectHistorial}
        onDeleteHistorial={deleteHistorial}
        onClearHistorial={clearHistorial}
      />
    )
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          action={toast.action}
          onAction={toast.onAction}
          duration={toast.type === 'error' || toast.type === 'info' ? 5000 : 3000}
          onDone={() => setToast(null)}
        />
      )}

      <div className={`uploader${cargando ? ' uploader-cargando' : ''}`}>
        <div className="foto-count">
          <span className="foto-count-label">FOTOS AÑADIDAS</span>
          <span className="foto-count-num">{numFotos} / 4</span>
        </div>
        <div
          className="foto-progress"
          role="progressbar"
          aria-valuenow={numFotos}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-label={`${numFotos} de 4 fotos añadidas`}
        >
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
                aria-label={filled ? `Foto ${label.toLowerCase()} — haz clic para cambiar` : `Subir foto ${label.toLowerCase()}${required ? ' (obligatoria)' : ''}`}
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
                    />
                    {fotos[key]?.compressing && (
                      <div className="foto-compressing-overlay" aria-hidden="true">
                        <span className="spinner" />
                      </div>
                    )}
                    <div className="foto-overlay">
                      <span className="foto-overlay-text">CAMBIAR FOTO</span>
                    </div>
                    <button
                      className="foto-remove"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSlot(key) }}
                      aria-label={`Eliminar foto ${label.toLowerCase()}`}
                      title="Eliminar foto"
                    >
                      ✕
                    </button>
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
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileInput(e, key)}
                />
              </label>
            )
          })}
        </div>

        {fotos.principal && (
          <>
            <button
              className={`btn-generate ${btnState} btn-enter`}
              onClick={analizar}
              disabled={cargando || isCompressing}
              aria-disabled={isCompressing || cargando}
              aria-busy={cargando || isCompressing}
              aria-label={cargando ? 'Analizando prenda, por favor espera' : isCompressing ? 'Procesando imagen, por favor espera' : 'Generar ficha para Vinted'}
              style={isCompressing ? { cursor: 'wait' } : undefined}
            >
              {cargando ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  ANALIZANDO PRENDA...
                </>
              ) : isCompressing ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  COMPRIMIENDO FOTO...
                </>
              ) : (
                <>
                  <span aria-hidden="true">→</span>
                  {numFotos === 4 ? 'GENERAR FICHA COMPLETA' : 'GENERAR FICHA'}
                </>
              )}
            </button>
            {!cargando && !isCompressing && (
              <p className="shortcut-hint" aria-hidden="true">o pulsa Enter</p>
            )}
          </>
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
