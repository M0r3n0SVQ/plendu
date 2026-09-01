'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ESTADO_OPTIONS, CATEGORIA_OPTIONS, ALERTA_MESSAGES } from '../lib/vintedOptions'
import { sanitizeHistorial, mergeHistorial, MAX_HISTORIAL, MEDIDAS_MAX_LEN } from '../lib/historial'
import { SYNC_CODE_KEY, pushSync } from '../lib/syncClient'
import PhotoEditor from './PhotoEditor'
import SyncModal from './SyncModal'

const SLOTS = [
  { key: 'principal', label: 'Principal', icon: '⊡', required: true,  hint: 'foto frontal',  gridClass: 'slot-principal' },
  { key: 'etiqueta',  label: 'Etiqueta',  icon: '◈', required: false, hint: 'marca / talla', gridClass: 'slot-secondary' },
  { key: 'trasera',   label: 'Trasera',   icon: '◧', required: false, hint: 'parte trasera', gridClass: 'slot-secondary' },
  { key: 'detalle',   label: 'Detalle',   icon: '◎', required: false, hint: 'primer plano',  gridClass: 'slot-secondary' },
]

const MAX_MB = 5
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const HISTORIAL_KEY = 'plendu_historial'

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

// Coarse average-luminance sample to flag photos that are clearly too dark
// or blown out before spending an API call on them. Draws the source canvas
// down to a tiny sample canvas first and reads *that* — getImageData on the
// full w×h canvas would allocate/copy the whole multi-MB pixel buffer just
// to average a few thousand of them, which the browser's own image scaling
// already does more cheaply (and more accurately: every source pixel
// contributes to the downsample, not just the ones a stride happens to land
// on). Deliberately skips blur detection: a simple sharpness heuristic (e.g.
// Laplacian variance) flags flat, low-texture garments — a plain black
// t-shirt — as "blurry" just as often as an actually blurry photo, which
// would be more annoying than useful.
function estimateExposure(ctx, w, h) {
  const SAMPLE = 40
  const sw = Math.max(1, Math.min(SAMPLE, w))
  const sh = Math.max(1, Math.min(SAMPLE, h))
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = sw
  sampleCanvas.height = sh
  const sampleCtx = sampleCanvas.getContext('2d')
  sampleCtx.drawImage(ctx.canvas, 0, 0, sw, sh)
  const { data } = sampleCtx.getImageData(0, 0, sw, sh)
  let sum = 0
  const count = sw * sh
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const avg = sum / count
  if (avg < 35)  return 'oscura'
  if (avg > 245) return 'clara'
  return null
}

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
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const exposure = estimateExposure(ctx, w, h)
        // Release canvas memory
        canvas.width = 0
        canvas.height = 0
        resolve({ base64: dataUrl.split(',')[1], exposure }) // base64 part only
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

function loadHistorial() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]')
    return sanitizeHistorial(raw, MAX_HISTORIAL)
  } catch {
    return []
  }
}

// Debounces the network push only — localStorage below still saves every
// call synchronously. Some callers (e.g. a medidas keystroke) invoke this on
// every change, which would otherwise fire one POST per keystroke.
let syncPushTimer = null
const SYNC_PUSH_DEBOUNCE_MS = 800

function saveHistorial(items) {
  try {
    localStorage.setItem(HISTORIAL_KEY, JSON.stringify(items))
    // Every mutation goes through this one function, so pushing the sync
    // copy here (instead of at each call site) means no caller can forget
    // to keep the other device's copy up to date. Best-effort: the local
    // save already succeeded, so a sync failure here is silent.
    const code = localStorage.getItem(SYNC_CODE_KEY)
    if (code) {
      clearTimeout(syncPushTimer)
      syncPushTimer = setTimeout(() => {
        pushSync(code, items).catch(() => {})
      }, SYNC_PUSH_DEBOUNCE_MS)
    }
    return true
  } catch {
    return false
  }
}

// Quotes a CSV field and doubles any internal quotes (RFC 4180)
function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function historialToCSV(historial) {
  const headers = [
    'Fecha', 'Título', 'Descripción', 'Precio', 'Estado', 'Categoría', 'Marca', 'Talla', 'Medidas',
    'Campos estimados', 'Alerta', 'Vendida', 'Precio de venta',
  ]
  const rows = historial.map(item => [
    item.fecha,
    item.ficha.titulo,
    item.ficha.descripcion,
    item.ficha.precio,
    item.ficha.estado,
    item.ficha.categoria,
    item.ficha.marca,
    item.ficha.talla,
    item.ficha.medidas || '',
    Array.isArray(item.ficha.camposDudosos) ? item.ficha.camposDudosos.join('; ') : '',
    ALERTA_MESSAGES[item.ficha.alerta] || '',
    item.vendida ? 'Sí' : 'No',
    item.vendida && item.precioVenta != null ? item.precioVenta : '',
  ])
  // Leading BOM so Excel detects UTF-8 instead of mangling acentos/€
  return '﻿' + [headers, ...rows].map(row => row.map(csvField).join(',')).join('\r\n')
}

// Used to open the photo editor on the already-compressed image (~80-200KB,
// per compressImage's comment) rather than the original multi-MB upload —
// re-encoding a full-resolution original on every rotate/crop step risks
// coming back over the 5MB cap and having the edit silently rejected.
function base64ToBlobUrl(base64, mime) {
  const bytes = atob(base64)
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return URL.createObjectURL(new Blob([buf], { type: mime }))
}

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
function EmptyPanel({ historial, onSelectHistorial, onDeleteHistorial, onClearHistorial, onExportHistorial, onToggleVendida, onOpenSync, syncCode }) {
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

/* ─── Skeleton shimmer ───────────────────── */
const ANALIZANDO_MENSAJES = [
  'Analizando fotos...',
  'Detectando marca y talla...',
  'Redactando la descripción...',
  'Calculando precio de mercado...',
]

function SkeletonPanel() {
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex(i => (i + 1) % ANALIZANDO_MENSAJES.length)
    }, 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="skeleton-wrap">
      <div className="skeleton-header">
        <div className="skeleton-status">
          <span className="skeleton-dot" />
          <span className="skeleton-status-text" aria-live="polite">
            {ANALIZANDO_MENSAJES[msgIndex]}
          </span>
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

  // Fields the AI flagged as an uncertain estimate (e.g. talla guessed with no visible tag)
  const esDudoso = (campo) => Array.isArray(ficha.camposDudosos) && ficha.camposDudosos.includes(campo)

  // A field the AI flagged as uncertain stops being uncertain once a human
  // has actually looked at it and (re)typed the value — clear the flag
  // alongside the edit so "ESTIMADO" doesn't keep pointing at a value nobody
  // estimated anymore.
  const setCampoVerificado = (campo, valor) => {
    setFicha(prev => ({
      ...prev,
      [campo]: valor,
      camposDudosos: Array.isArray(prev.camposDudosos)
        ? prev.camposDudosos.filter(f => f !== campo)
        : prev.camposDudosos,
    }))
  }

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
      {ALERTA_MESSAGES[ficha.alerta] && (
        <div className="ficha-alert" role="alert">
          <span className="ficha-alert-icon" aria-hidden="true">!</span>
          <span>{ALERTA_MESSAGES[ficha.alerta]}</span>
        </div>
      )}

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
                {(editando === key ? draft : value).length > 80 ? ' · demasiado largo' : ''}
              </p>
            )}
            {key === 'descripcion' && (
              <p className={`ficha-char-count${(editando === key ? draft : value).length > 800 ? ' over' : ''}`}>
                {(editando === key ? draft : value).length}/800 caracteres
                {(editando === key ? draft : value).length > 800 ? ' · puede ser demasiado larga' : ''}
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
            {esDudoso('estado') && (
              <span className="dudoso-badge" title="Estimado por la IA — revísalo antes de publicar">ESTIMADO</span>
            )}
          </span>
          <select
            className="meta-input meta-select"
            value={ficha.estado || ''}
            onChange={e => setCampoVerificado('estado', e.target.value)}
            aria-label="Estado de la prenda"
          >
            <option value="">Elegir estado</option>
            {ESTADO_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">
            CATEGORÍA
            {esDudoso('categoria') && (
              <span className="dudoso-badge" title="Estimado por la IA — revísalo antes de publicar">ESTIMADO</span>
            )}
          </span>
          <input
            className="meta-input"
            value={ficha.categoria || ''}
            onChange={e => setCampoVerificado('categoria', e.target.value.slice(0, 100))}
            placeholder="ej: Camisetas y tops"
            aria-label="Categoría de Vinted"
            list="vinted-categorias"
          />
          <datalist id="vinted-categorias">
            {CATEGORIA_OPTIONS.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">
            MARCA
            {esDudoso('marca') && (
              <span className="dudoso-badge" title="Estimado por la IA — revísalo antes de publicar">ESTIMADO</span>
            )}
          </span>
          <input
            className="meta-input"
            value={ficha.marca || ''}
            onChange={e => setCampoVerificado('marca', e.target.value.slice(0, 100))}
            placeholder="ej: Nike"
            aria-label="Marca de la prenda"
          />
        </div>

        <div className="ficha-meta-field">
          <span className="ficha-meta-label">
            TALLA
            {esDudoso('talla') && (
              <span className="dudoso-badge" title="Estimado por la IA — revísalo antes de publicar">ESTIMADO</span>
            )}
          </span>
          <input
            className="meta-input"
            value={ficha.talla || ''}
            onChange={e => setCampoVerificado('talla', e.target.value.slice(0, 50))}
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
  const [notas, setNotas]               = useState('')
  const [editingKey, setEditingKey]     = useState(null)
  const [editorUrl, setEditorUrl]       = useState(null)
  const [syncCode, setSyncCode]         = useState(null)
  const [showSyncModal, setShowSyncModal] = useState(false)

  const abortRef            = useRef(null)
  const hintTimerRef        = useRef(null)
  const currentEntryIdRef   = useRef(null)  // id of the historial entry shown

  useEffect(() => {
    setPortalTarget(document.getElementById('resultado-col'))
    setHistorial(loadHistorial())
    setSyncCode(localStorage.getItem(SYNC_CODE_KEY))
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
      const { base64, exposure } = await compressImage(file)
      let discarded = false
      setFotos(prev => {
        // If user replaced this slot before compression finished, discard
        if (prev[key]?.url !== url) { discarded = true; URL.revokeObjectURL(url); return prev }
        return { ...prev, [key]: { url, base64, mime: 'image/jpeg', compressing: false } }
      })
      if (!discarded && exposure === 'oscura') {
        showToast('Esta foto se ve bastante oscura, la IA podría acertar menos. Si puedes, repítela con más luz.', 'info')
      } else if (!discarded && exposure === 'clara') {
        showToast('Esta foto sale muy sobreexpuesta (demasiada luz), la IA podría acertar menos.', 'info')
      }
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

  // Swap (or move, if the target is empty) an already-uploaded photo into a
  // different slot. Guards against a slot mid-compression: swapping it here
  // and having processFile's stale-check resolve against the OLD key later
  // would revoke the URL the photo just moved to and leave it stuck loading.
  const swapSlots = useCallback((keyA, keyB) => {
    if (keyA === keyB) return
    setFotos(prev => {
      if (!prev[keyA] || prev[keyA].compressing) return prev
      const next = { ...prev }
      const fromPhoto = prev[keyA]
      const toPhoto = prev[keyB]
      if (toPhoto) {
        next[keyB] = fromPhoto
        next[keyA] = toPhoto
      } else {
        next[keyB] = fromPhoto
        delete next[keyA]
      }
      return next
    })
  }, [])

  // Reorder photos by dragging one slot onto another. Built on Pointer Events
  // (not native HTML5 drag-and-drop) specifically because native DnD never
  // fires from touch input on mobile Safari/Chrome — this is a resale app,
  // most sellers are on a phone, and that's the platform this has to work on.
  const REORDER_THRESHOLD = 8
  const reorderRef = useRef(null)       // { key, startX, startY, isDragging, pointerId }
  const justReorderedRef = useRef(false) // suppresses the click-to-open-file-picker right after a real drag
  const [reorderDragKey, setReorderDragKey] = useState(null)
  const [reorderOverKey, setReorderOverKey] = useState(null)

  const slotKeyAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest('[data-slot-key]')?.dataset.slotKey || null
  }

  const handleSlotPointerDown = useCallback((e, key) => {
    if (!fotos[key] || fotos[key].compressing) return
    reorderRef.current = { key, startX: e.clientX, startY: e.clientY, isDragging: false, pointerId: e.pointerId }
  }, [fotos])

  const handleSlotPointerMove = useCallback((e) => {
    const state = reorderRef.current
    if (!state) return
    if (!state.isDragging) {
      const moved = Math.hypot(e.clientX - state.startX, e.clientY - state.startY)
      if (moved < REORDER_THRESHOLD) return
      state.isDragging = true
      setReorderDragKey(state.key)
      try { e.currentTarget.setPointerCapture?.(state.pointerId) } catch { /* no active pointer — fine */ }
    }
    e.preventDefault() // stop touch-scroll once a drag is actually underway
    setReorderOverKey(slotKeyAtPoint(e.clientX, e.clientY))
  }, [])

  const handleSlotPointerUp = useCallback((e) => {
    const state = reorderRef.current
    reorderRef.current = null
    setReorderDragKey(null)
    setReorderOverKey(null)
    if (!state?.isDragging) return
    justReorderedRef.current = true
    const overKey = slotKeyAtPoint(e.clientX, e.clientY)
    if (overKey) swapSlots(state.key, overKey)
  }, [swapSlots])

  // <label> normally opens the file picker on click — suppress just the one
  // click that follows a real drag gesture, let every other click through.
  const handleSlotClickCapture = useCallback((e) => {
    if (justReorderedRef.current) {
      justReorderedRef.current = false
      e.preventDefault()
    }
  }, [])

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

    // Auto-abort after 45s. The server's own OpenAI client budgets up to
    // ~40s worst case (20s timeout x up to 2 attempts, see route.js) before
    // it can even return an error — aborting any sooner on the client just
    // means the server keeps burning a real OpenAI request for a response
    // the user already gave up on. 45s stays under Vercel's 60s maxDuration
    // with margin while still giving the server's retry a chance to land.
    let timedOut = false
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort() }, 45_000)

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
          notas: notas.trim() || undefined,
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
          showToast('Sin etiqueta visible: añade una foto de la etiqueta para mejor resultado', 'info')
        } else if (data.estado === 'Satisfactorio') {
          showToast('Estado Satisfactorio: recuerda fotografiar los defectos al publicar en Vinted', 'info')
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
        vendida: false,
        precioVenta: null,
        updatedAt: newId,
      }

      // Track which historial entry is being shown so medidas edits sync to it
      currentEntryIdRef.current = newId
      setMedidas('')

      // Functional update: a slow analyze call must insert into whatever
      // historial exists when it resolves, not the array captured when it
      // started (which a sync pull or another edit may have since replaced).
      setHistorial(prev => {
        const nuevo = [entrada, ...prev].slice(0, MAX_HISTORIAL)
        if (!saveHistorial(nuevo)) {
          showToast('No se pudo guardar en historial.', 'error')
        }
        return nuevo
      })

    } catch (err) {
      if (err.name === 'AbortError') {
        if (timedOut) showToast('La IA tardó demasiado.', 'error', 'REINTENTAR', () => analizar())
        return
      }
      showToast(err.message || 'Error inesperado.', 'error', 'REINTENTAR', () => analizar())
    } finally {
      clearTimeout(timeoutId)
      setCargando(false)
    }
  }, [fotos, cargando, showToast, notas])

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
    setNotas('')
    currentEntryIdRef.current = null
  }, [fotos])

  const volverAlHistorial = useCallback(() => {
    setFicha(null)
    setThumbnail(null)
    setMedidas('')
    setNotas('')
    currentEntryIdRef.current = null
  }, [])

  const selectHistorial = useCallback((item) => {
    setFicha(item.ficha)
    setThumbnail(item.thumbnail)
    setMedidas(typeof item.ficha.medidas === 'string' ? item.ficha.medidas : '')
    setNotas('')
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
          ? { ...item, ficha: { ...item.ficha, medidas: value }, updatedAt: Date.now() }
          : item
      )
      saveHistorial(next)
      return next
    })
  }, [])

  // Functional update throughout: reads the historial that exists when this
  // runs, not a closed-over snapshot, so it can't race a concurrent sync
  // merge or edit into resurrecting/dropping unrelated items.
  const deleteHistorial = useCallback((id) => {
    setHistorial(prev => {
      const item = prev.find(h => h.id === id)
      if (!item) return prev
      const nuevo = prev.filter(h => h.id !== id)
      saveHistorial(nuevo)

      // Offer undo for 5 seconds
      const titulo = item.ficha.titulo
      showToast(
        `"${titulo.length > 22 ? titulo.slice(0, 22) + '…' : titulo}" eliminado`,
        'info',
        'DESHACER',
        () => {
          setHistorial(prev2 => {
            const restaurado = [item, ...prev2]
              .sort((a, b) => b.id - a.id)
              .slice(0, MAX_HISTORIAL)
            saveHistorial(restaurado)
            return restaurado
          })
        }
      )
      return nuevo
    })
  }, [showToast])

  const toggleVendida = useCallback((id) => {
    setHistorial(prev => {
      const next = prev.map(item =>
        item.id === id
          ? { ...item, vendida: !item.vendida, precioVenta: !item.vendida ? item.ficha.precio : null, updatedAt: Date.now() }
          : item
      )
      saveHistorial(next)
      return next
    })
  }, [])

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

  const openEditor = useCallback((key) => {
    const foto = fotos[key]
    if (!foto || foto.compressing || !foto.base64) return
    setEditorUrl(base64ToBlobUrl(foto.base64, foto.mime || 'image/jpeg'))
    setEditingKey(key)
  }, [fotos])

  const closeEditor = useCallback(() => {
    if (editorUrl) URL.revokeObjectURL(editorUrl)
    setEditorUrl(null)
    setEditingKey(null)
  }, [editorUrl])

  const clearHistorial = useCallback(() => {
    setHistorial(prev => {
      if (prev.length === 0) return prev
      saveHistorial([])
      showToast(
        `${prev.length} ${prev.length === 1 ? 'prenda eliminada' : 'prendas eliminadas'}`,
        'info',
        'DESHACER',
        () => {
          setHistorial(prev)
          saveHistorial(prev)
        }
      )
      return []
    })
  }, [showToast])

  const exportarHistorial = useCallback(() => {
    if (historial.length === 0) return
    const fecha = new Date().toISOString().slice(0, 10)
    downloadTextFile(`plendu-historial-${fecha}.csv`, historialToCSV(historial), 'text/csv;charset=utf-8')
    showToast(`${historial.length} ${historial.length === 1 ? 'ficha exportada' : 'fichas exportadas'}`, 'success')
  }, [historial, showToast])

  // A fresh code was just pushed with the current historial in SyncModal —
  // just remember it locally, nothing to merge (the server already has
  // exactly what's already on screen).
  const handleSyncActivate = useCallback((code) => {
    localStorage.setItem(SYNC_CODE_KEY, code)
    setSyncCode(code)
    setShowSyncModal(false)
    showToast('Sincronización activada', 'success')
  }, [showToast])

  const handleSyncDeactivate = useCallback(() => {
    localStorage.removeItem(SYNC_CODE_KEY)
    setSyncCode(null)
    setShowSyncModal(false)
    showToast('Sincronización desactivada en este dispositivo', 'info')
  }, [showToast])

  // The server copy is gone — local historial is untouched, this only stops
  // the link between devices.
  const handleSyncDeleted = useCallback(() => {
    localStorage.removeItem(SYNC_CODE_KEY)
    setSyncCode(null)
    setShowSyncModal(false)
    showToast('Datos de sincronización eliminados de la nube', 'info')
  }, [showToast])

  // Pulled a code from another device — merge with whatever's already local
  // rather than picking a side, so neither device's history is silently
  // discarded, then push the merged result back so both ends agree.
  const handleSyncMerged = useCallback((code, remoteHistorial) => {
    setHistorial(prev => {
      const merged = mergeHistorial(prev, remoteHistorial, MAX_HISTORIAL)
      localStorage.setItem(SYNC_CODE_KEY, code)
      saveHistorial(merged)
      return merged
    })
    setSyncCode(code)
    setShowSyncModal(false)
    showToast('Historial sincronizado', 'success')
  }, [showToast])

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
        onExportHistorial={exportarHistorial}
        onToggleVendida={toggleVendida}
        onOpenSync={() => setShowSyncModal(true)}
        syncCode={syncCode}
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

      {editingKey && editorUrl && (
        <PhotoEditor
          photoUrl={editorUrl}
          onApply={(file) => { processFile(file, editingKey); closeEditor() }}
          onCancel={closeEditor}
        />
      )}

      {showSyncModal && (
        <SyncModal
          currentCode={syncCode}
          historial={historial}
          onActivate={handleSyncActivate}
          onDeactivate={handleSyncDeactivate}
          onDeleted={handleSyncDeleted}
          onMerged={handleSyncMerged}
          onClose={() => setShowSyncModal(false)}
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
                data-slot-key={key}
                className={`foto-slot ${gridClass}${filled ? ' filled' : ''}${isDraggingThis ? ' is-dragging' : ''}${reorderDragKey === key ? ' is-reorder-source' : ''}${reorderOverKey === key && reorderDragKey && reorderDragKey !== key ? ' is-reorder-target' : ''}`}
                aria-label={filled ? `Foto ${label.toLowerCase()}, haz clic para cambiar` : `Subir foto ${label.toLowerCase()}${required ? ' (obligatoria)' : ''}`}
                onPointerDown={filled ? (e) => handleSlotPointerDown(e, key) : undefined}
                onPointerMove={filled ? handleSlotPointerMove : undefined}
                onPointerUp={filled ? handleSlotPointerUp : undefined}
                onPointerCancel={filled ? handleSlotPointerUp : undefined}
                onClickCapture={filled ? handleSlotClickCapture : undefined}
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
                      draggable={false}
                    />
                    {fotos[key]?.compressing && (
                      <div className="foto-compressing-overlay" aria-hidden="true">
                        <span className="spinner" />
                      </div>
                    )}
                    <div className="foto-overlay">
                      <span className="foto-overlay-text">CAMBIAR FOTO</span>
                    </div>
                    <div className="foto-slot-buttons">
                      <button
                        className="foto-edit"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditor(key) }}
                        aria-label={`Editar foto ${label.toLowerCase()}`}
                        title="Recortar / rotar"
                      >
                        ✎
                      </button>
                      <button
                        className="foto-remove"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSlot(key) }}
                        aria-label={`Eliminar foto ${label.toLowerCase()}`}
                        title="Eliminar foto"
                      >
                        ✕
                      </button>
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
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileInput(e, key)}
                />
              </label>
            )
          })}
        </div>
        {numFotos >= 2 && (
          <p className="foto-reorder-hint">Arrastra una foto sobre otra para intercambiarlas</p>
        )}

        {fotos.principal && (
          <>
            <div className="notas-field">
              <label htmlFor="notas-ia" className="foto-count-label">NOTAS PARA LA IA (OPCIONAL)</label>
              <input
                id="notas-ia"
                className="meta-input"
                type="text"
                value={notas}
                onChange={e => setNotas(e.target.value.slice(0, 200))}
                placeholder="ej: mancha pequeña en el interior de la manga"
                maxLength={200}
              />
            </div>

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
