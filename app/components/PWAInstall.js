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

    // Dismissed recently (30-day cooldown)
    const dismissed = localStorage.getItem('pwa-dismissed')
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 30 * 24 * 60 * 60 * 1000) return

    // New users see the onboarding modal first — delay the banner so both
    // don't compete for attention on the very first visit
    const isNewUser = !localStorage.getItem('plendu_onboarded')
    const delay = isNewUser ? 8000 : 1000

    // iOS Safari: no beforeinstallprompt, show manual instructions.
    // iPadOS 13+ reports as Mac — detect via touch points fallback.
    const ua = navigator.userAgent
    const isIpadOS = /Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1
    const ios = (/iphone|ipad|ipod/i.test(ua) || isIpadOS) && !window.MSStream
    if (ios) {
      const t = setTimeout(() => { setIsIOS(true); setVisible(true) }, delay)
      return () => clearTimeout(t)
    }

    // Chrome / Edge: native install prompt
    let timeoutId
    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      timeoutId = setTimeout(() => setVisible(true), delay)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timeoutId)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        setVisible(false)
        setPrompt(null)
      }
    } catch {
      // Prompt dismissed or unavailable — hide banner
      setVisible(false)
    }
  }

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem('pwa-dismissed', Date.now().toString())
  }

  if (!visible) return null

  return (
    <div className="pwa-banner" role="complementary" aria-label="Instalar aplicación">
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
