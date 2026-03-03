'use client'

import { useState, useEffect } from 'react'

export default function PWAInstall() {
  const [prompt, setPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Already installed as PWA — nothing to show
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (window.navigator.standalone) return

    // Dismissed this session
    if (sessionStorage.getItem('pwa-dismissed')) return

    // iOS Safari: no beforeinstallprompt, show manual instructions
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    if (ios) {
      setIsIOS(true)
      setVisible(true)
      return
    }

    // Chrome / Edge: native install prompt
    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      setPrompt(null)
    }
  }

  const dismiss = () => {
    setVisible(false)
    sessionStorage.setItem('pwa-dismissed', '1')
  }

  if (!visible) return null

  return (
    <div className="pwa-banner" role="banner" aria-label="Instalar aplicación">
      <div className="pwa-banner-icon" aria-hidden="true">
        {isIOS ? '⬆' : '⊕'}
      </div>

      <div className="pwa-banner-text">
        <p className="pwa-banner-title">Instalar Plendu</p>
        {isIOS ? (
          <p className="pwa-banner-sub">
            Pulsa <strong>Compartir</strong> → <strong>Añadir a inicio</strong>
          </p>
        ) : (
          <p className="pwa-banner-sub">
            Úsala sin navegador, directo desde tu pantalla
          </p>
        )}
      </div>

      {!isIOS && (
        <button className="pwa-install-btn" onClick={install}>
          Instalar
        </button>
      )}

      <button
        className="pwa-dismiss-btn"
        onClick={dismiss}
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  )
}
