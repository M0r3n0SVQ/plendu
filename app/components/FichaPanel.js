'use client'

import { useState, useCallback, useEffect } from 'react'
import { ESTADO_OPTIONS, CATEGORIA_OPTIONS, TALLA_OPTIONS, ALERTA_MESSAGES } from '../lib/vintedOptions'
import { MEDIDAS_MAX_LEN } from '../lib/historial'
import { copyToClipboard } from '../lib/clipboard'
import { buildStoryImage } from '../lib/imageUtils'

export default function FichaPanel({
  ficha: fichaInit, thumbnail, onReset, onVolver, onRegenerar,
  hayHistorial, showToast, medidas, onMedidasChange,
}) {
  const [ficha, setFicha]             = useState(fichaInit)
  const [editando, setEditando]       = useState(null)   // 'titulo' | 'descripcion'
  const [draft, setDraft]             = useState('')
  const [copiado, setCopiado]         = useState(null)
  const [copiadoTodo, setCopiadoTodo] = useState(false)
  const [creandoStory, setCreandoStory] = useState(false)

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
      // thumbnail is either a data: URL (from a saved historial entry) or a
      // blob: URL (right after analyzing) — both are local, safe to fetch.
      if (thumbnail && typeof thumbnail === 'string' && (thumbnail.startsWith('data:image/') || thumbnail.startsWith('blob:'))) {
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

  // Builds a 9:16 image for Instagram/TikTok stories. Shares it directly on
  // mobile when the Web Share Level 2 file API is available; otherwise
  // downloads it, since desktop has no "share to Instagram" to hand off to.
  const crearImagenStory = useCallback(async () => {
    if (creandoStory || !thumbnail) return
    setCreandoStory(true)
    try {
      const blob = await buildStoryImage({ photoUrl: thumbnail, titulo: ficha.titulo, precio: ficha.precio })
      const file = new File([blob], 'plendu-story.jpg', { type: 'image/jpeg' })

      if (canShare && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: ficha.titulo })
        } catch { /* user cancelled — the image itself was still generated fine */ }
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plendu-story.jpg'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      showToast('No se pudo generar la imagen.', 'error')
    } finally {
      setCreandoStory(false)
    }
  }, [creandoStory, thumbnail, ficha.titulo, ficha.precio, canShare, showToast])

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
        {thumbnail && (
          <button
            className="btn-share"
            onClick={crearImagenStory}
            disabled={creandoStory}
            aria-label="Crear imagen para stories de Instagram o TikTok"
          >
            {creandoStory ? '···' : '▢ STORY'}
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
