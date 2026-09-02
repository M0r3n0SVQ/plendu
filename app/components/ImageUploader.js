'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { mergeHistorial, MAX_HISTORIAL } from '../lib/historial'
import { MERCADOS, MERCADO_DEFAULT, MERCADO_IDS, isMercadoId } from '../lib/vintedOptions'
import { SYNC_CODE_KEY } from '../lib/syncClient'
import { compressImage, generateThumbnail, base64ToBlobUrl } from '../lib/imageUtils'
import { loadHistorial, saveHistorial } from '../lib/historialStore'
import { historialToCSV, downloadTextFile } from '../lib/csvExport'
import PhotoEditor from './PhotoEditor'
import SyncModal from './SyncModal'
import Toast from './Toast'
import EmptyPanel from './EmptyPanel'
import SkeletonPanel from './SkeletonPanel'
import FichaPanel from './FichaPanel'

const SLOTS = [
  { key: 'principal', label: 'Principal', icon: '⊡', required: true,  hint: 'foto frontal',  gridClass: 'slot-principal' },
  { key: 'etiqueta',  label: 'Etiqueta',  icon: '◈', required: false, hint: 'marca / talla', gridClass: 'slot-secondary' },
  { key: 'trasera',   label: 'Trasera',   icon: '◧', required: false, hint: 'parte trasera', gridClass: 'slot-secondary' },
  { key: 'detalle',   label: 'Detalle',   icon: '◎', required: false, hint: 'primer plano',  gridClass: 'slot-secondary' },
]

const MAX_MB = 5
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MERCADO_KEY = 'plendu_mercado'

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
  const [mercado, setMercado]           = useState(MERCADO_DEFAULT)

  const abortRef            = useRef(null)
  const hintTimerRef        = useRef(null)
  const currentEntryIdRef   = useRef(null)  // id of the historial entry shown

  useEffect(() => {
    setPortalTarget(document.getElementById('resultado-col'))
    setHistorial(loadHistorial())
    setSyncCode(localStorage.getItem(SYNC_CODE_KEY))
    const savedMercado = localStorage.getItem(MERCADO_KEY)
    if (isMercadoId(savedMercado)) setMercado(savedMercado)
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

  const handleMercadoChange = useCallback((value) => {
    if (!isMercadoId(value)) return
    setMercado(value)
    localStorage.setItem(MERCADO_KEY, value)
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
          mercado,
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
  }, [fotos, cargando, showToast, notas, mercado])

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
        <div className="mercado-field">
          <label htmlFor="mercado-venta" className="foto-count-label">MERCADO DE VENTA</label>
          <select
            id="mercado-venta"
            className="meta-input meta-select"
            value={mercado}
            onChange={e => handleMercadoChange(e.target.value)}
            disabled={cargando}
          >
            {MERCADO_IDS.map(id => (
              <option key={id} value={id}>{MERCADOS[id].nombre}</option>
            ))}
          </select>
        </div>

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
