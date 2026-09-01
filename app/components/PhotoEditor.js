'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// Rotation and cropping are each baked into a fresh canvas the moment the
// user applies them, rather than tracked as compound transforms to reconcile
// at export time. Slightly more re-encoding, much simpler (and safer) math —
// the crop rectangle only ever has to reason about one already-rotated image.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = url
  })
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))),
      'image/jpeg',
      0.92
    )
  })
}

export default function PhotoEditor({ photoUrl, onApply, onCancel }) {
  const [workingUrl, setWorkingUrl] = useState(photoUrl)
  const [rect, setRect] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const imgRef = useRef(null)
  const dragStartRef = useRef(null)
  // Tracks the most recent URL *we* created (via rotate/crop), so it can be
  // revoked the moment it's superseded rather than piling up for the whole
  // editing session — null means workingUrl is still the original `photoUrl`
  // prop, which this component doesn't own and must not revoke.
  const ownedUrlRef = useRef(null)

  useEffect(() => () => {
    if (ownedUrlRef.current) URL.revokeObjectURL(ownedUrlRef.current)
  }, [])

  // Replaces workingUrl with a freshly-created object URL, revoking whichever
  // one we created for the previous step (if any) first.
  const replaceWorkingUrl = (url) => {
    if (ownedUrlRef.current) URL.revokeObjectURL(ownedUrlRef.current)
    ownedUrlRef.current = url
    setWorkingUrl(url)
  }

  const rotate = useCallback(async (deg) => {
    setBusy(true)
    setError(null)
    try {
      const img = await loadImage(workingUrl)
      const swap = deg === 90 || deg === 270
      const w = swap ? img.naturalHeight : img.naturalWidth
      const h = swap ? img.naturalWidth : img.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.translate(w / 2, h / 2)
      ctx.rotate((deg * Math.PI) / 180)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      const blob = await canvasToBlob(canvas)
      replaceWorkingUrl(URL.createObjectURL(blob))
      setRect(null)
    } catch {
      setError('No se pudo rotar la imagen.')
    } finally {
      setBusy(false)
    }
  }, [workingUrl])

  const clampRect = (r, bounds) => {
    const x = Math.max(0, Math.min(r.x, bounds.w))
    const y = Math.max(0, Math.min(r.y, bounds.h))
    const w = Math.max(0, Math.min(r.w, bounds.w - x))
    const h = Math.max(0, Math.min(r.h, bounds.h - y))
    return { x, y, w, h }
  }

  const handlePointerDown = (e) => {
    if (busy || !imgRef.current) return
    const bounds = imgRef.current.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    dragStartRef.current = { x, y }
    setRect({ x, y, w: 0, h: 0 })
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* no active pointer to capture — fine */ }
  }

  const handlePointerMove = (e) => {
    // dragStartRef (a ref) is the source of truth, not React state — state
    // updates from pointerdown may not have flushed yet by the time the
    // first pointermove fires, which would make a state-based check miss it.
    if (!dragStartRef.current || !imgRef.current) return
    const bounds = imgRef.current.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    const start = dragStartRef.current
    setRect(clampRect(
      { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) },
      { w: bounds.width, h: bounds.height }
    ))
  }

  const handlePointerUp = () => {
    dragStartRef.current = null
  }

  const canCrop = rect && rect.w > 12 && rect.h > 12

  const applyCrop = useCallback(async () => {
    if (!canCrop || !imgRef.current) return
    setBusy(true)
    setError(null)
    try {
      const img = await loadImage(workingUrl)
      const bounds = imgRef.current.getBoundingClientRect()
      const scaleX = img.naturalWidth / bounds.width
      const scaleY = img.naturalHeight / bounds.height
      const sx = rect.x * scaleX
      const sy = rect.y * scaleY
      const sw = rect.w * scaleX
      const sh = rect.h * scaleY
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw))
      canvas.height = Math.max(1, Math.round(sh))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas)
      replaceWorkingUrl(URL.createObjectURL(blob))
      setRect(null)
    } catch {
      setError('No se pudo recortar la imagen.')
    } finally {
      setBusy(false)
    }
  }, [canCrop, rect, workingUrl])

  const handleApply = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const resp = await fetch(workingUrl)
      const blob = await resp.blob()
      onApply(new File([blob], 'editada.jpg', { type: 'image/jpeg' }))
    } catch {
      setError('No se pudo aplicar la edición.')
      setBusy(false)
    }
  }, [workingUrl, onApply])

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal photo-editor" role="dialog" aria-modal="true" aria-label="Editar foto">
        <p className="photo-editor-title">Editar foto</p>

        <div
          className="photo-editor-canvas-wrap"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={workingUrl}
            alt=""
            draggable={false}
            key={workingUrl}
          />
          {rect && rect.w > 2 && rect.h > 2 && (
            <div
              className="photo-editor-crop-rect"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            />
          )}
          {busy && (
            <div className="photo-editor-busy" aria-hidden="true">
              <span className="spinner" />
            </div>
          )}
        </div>

        <p className="photo-editor-hint">
          {canCrop ? 'Suelta "Recortar selección" para aplicar solo ese recuadro' : 'Arrastra sobre la foto para recortar'}
        </p>
        {error && <p className="photo-editor-error">{error}</p>}

        <div className="photo-editor-actions">
          <button className="btn-reset" onClick={() => rotate(270)} disabled={busy}>⟲ Girar izq.</button>
          <button className="btn-reset" onClick={() => rotate(90)} disabled={busy}>⟳ Girar der.</button>
          <button className="btn-reset" onClick={applyCrop} disabled={busy || !canCrop}>
            Recortar selección
          </button>
        </div>

        <div className="photo-editor-footer">
          <button className="modal-btn" onClick={handleApply} disabled={busy}>
            {busy ? 'Aplicando…' : 'Aplicar cambios'}
          </button>
          <button className="modal-skip" onClick={onCancel} disabled={busy}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
