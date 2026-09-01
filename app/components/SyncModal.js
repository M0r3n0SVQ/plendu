'use client'

import { useState } from 'react'
import { generateSyncCode, pushSync, pullSync, deleteSync } from '../lib/syncClient'

export default function SyncModal({ currentCode, historial, onActivate, onDeactivate, onDeleted, onMerged, onClose }) {
  const [inputCode, setInputCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      const code = generateSyncCode()
      await pushSync(code, historial)
      onActivate(code)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handlePull = async () => {
    const code = inputCode.trim().toUpperCase()
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      const remoteHistorial = await pullSync(code)
      onMerged(code, remoteHistorial)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — the code is still selectable text */ }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); setError(null); return }
    setBusy(true)
    setError(null)
    try {
      await deleteSync(currentCode)
      onDeleted()
    } catch (e) {
      setError(e.message)
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        <p className="photo-editor-title" id="sync-title">Sincronizar entre dispositivos</p>

        {currentCode ? (
          <>
            <p className="modal-subtitle">
              Este dispositivo está sincronizado. Introduce este código en tu otro dispositivo para traerte el historial.
            </p>
            <div className="sync-code-display">
              <span>{currentCode}</span>
              <button className="btn-copy" onClick={handleCopy}>{copied ? '✓ COPIADO' : 'COPIAR'}</button>
            </div>
            <p className="sync-warning">
              Guarda este código — si lo pierdes, no hay forma de recuperar el acceso a ese historial (no pedimos email ni contraseña).
            </p>
            {error && <p className="photo-editor-error">{error}</p>}
            <button className="modal-skip" onClick={onDeactivate} disabled={busy}>
              Desactivar en este dispositivo
            </button>
            <button className="sync-delete-btn" onClick={handleDelete} disabled={busy}>
              {confirmDelete ? '¿Seguro? Se borra de la nube para siempre' : 'Eliminar datos de la nube'}
            </button>
          </>
        ) : (
          <>
            <p className="modal-subtitle">
              Sin cuentas ni email: genera un código y úsalo en tu otro dispositivo para tener el mismo historial en los dos.
            </p>
            <button className="modal-btn" onClick={handleGenerate} disabled={busy}>
              {busy ? 'Generando…' : 'Generar código nuevo'}
            </button>

            <div className="modal-divider" />

            <p className="sync-enter-label">¿Ya tienes un código de otro dispositivo?</p>
            <div className="sync-enter-row">
              <input
                className="meta-input"
                value={inputCode}
                onChange={e => setInputCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                aria-label="Código de sincronización"
                disabled={busy}
              />
              <button className="btn-reset" onClick={handlePull} disabled={busy || !inputCode.trim()}>
                Usar código
              </button>
            </div>
            {error && <p className="photo-editor-error">{error}</p>}
          </>
        )}

        <button className="modal-skip" onClick={onClose} disabled={busy} style={{ marginTop: '0.5rem' }}>
          Cerrar
        </button>
      </div>
    </div>
  )
}
