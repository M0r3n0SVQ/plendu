'use client'

import { useState, useEffect } from 'react'

const ONBOARDING_KEY = 'plendu_onboarded'

const STEPS = [
  {
    num: '01',
    title: 'Sube hasta 4 fotos',
    desc: 'La foto principal es obligatoria. Añade etiqueta, trasera y detalle para resultados más precisos.',
  },
  {
    num: '02',
    title: 'Genera la ficha con IA',
    desc: 'GPT-4o mini analiza las imágenes y genera título, descripción, precio, categoría, estado, marca y talla.',
  },
  {
    num: '03',
    title: 'Copia y publica en Vinted',
    desc: 'Copia cada campo por separado o pulsa "Copiar todo" para llevártelo de golpe a tu anuncio.',
  },
]

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done) setVisible(true)
  }, [])

  const cerrar = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">

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
