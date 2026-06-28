'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const ONBOARDING_KEY = 'plendu_onboarded'

const STEPS = [
  {
    num: '01',
    title: 'Sube hasta 4 fotos',
    desc: 'La principal es obligatoria. Añade etiqueta, trasera y detalle para resultados más precisos.',
  },
  {
    num: '02',
    title: 'Genera la ficha con IA',
    desc: 'GPT-4o mini analiza las imágenes y devuelve título, descripción con emojis estilo Vinted, precio, estado, categoría, marca y talla.',
  },
  {
    num: '03',
    title: 'Edita, añade medidas y publica',
    desc: 'Ajusta cualquier campo, añade medidas en plano y pulsa "Copiar todo" o copia cada campo por separado.',
  },
]

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false)
  const modalRef   = useRef(null)
  const triggerRef = useRef(null) // element focused before modal opened

  useEffect(() => {
    // One-shot read from localStorage on mount to decide if we show the modal.
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done) {
      triggerRef.current = document.activeElement
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true)
    }
  }, [])

  const cerrar = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setVisible(false)
    // Restore focus to the element that was active before the modal opened
    setTimeout(() => triggerRef.current?.focus(), 50)
  }, [])

  // Focus trap + ESC key
  useEffect(() => {
    if (!visible || !modalRef.current) return

    const modal = modalRef.current
    const els = modal.querySelectorAll(FOCUSABLE)
    els[0]?.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        cerrar()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = [...modal.querySelectorAll(FOCUSABLE)]
      if (focusable.length === 0) { e.preventDefault(); return }

      const first = focusable[0]
      const last  = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, cerrar])

  if (!visible) return null

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && cerrar()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={modalRef}
      >
        <div className="modal-logo" id="modal-title">
          Plendu
          <span className="modal-logo-dot" />
        </div>
        <p className="modal-subtitle">
          La forma más rápida de crear fichas para Vinted.<br />
          Así funciona en 3 pasos:
        </p>

        <div className="modal-steps">
          {STEPS.map(({ num, title, desc }) => (
            <div key={num} className="modal-step">
              <div className="modal-step-num">{num}</div>
              <div className="modal-step-content">
                <p className="modal-step-title">{title}</p>
                <p className="modal-step-desc">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-divider" />

        <div className="modal-tip">
          <span className="modal-tip-icon">◈</span>
          <p className="modal-tip-text">
            <strong>Consejo:</strong> La foto de la etiqueta es la más valiosa.
            Permite a la IA detectar marca, talla y composición del tejido automáticamente.
          </p>
        </div>

        <button className="modal-btn" onClick={cerrar}>
          → EMPEZAR A USAR PLENDU
        </button>
        <button className="modal-skip" onClick={cerrar}>
          Ya lo sé, cerrar
        </button>
      </div>
    </div>
  )
}
