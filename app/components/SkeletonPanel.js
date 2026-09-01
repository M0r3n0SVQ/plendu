'use client'

import { useState, useEffect } from 'react'

const ANALIZANDO_MENSAJES = [
  'Analizando fotos...',
  'Detectando marca y talla...',
  'Redactando la descripción...',
  'Calculando precio de mercado...',
]

export default function SkeletonPanel() {
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
