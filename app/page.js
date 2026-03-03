'use client'

import { useState, useEffect } from 'react'
import ImageUploader from './components/ImageUploader'
import OnboardingModal from './components/OnboardingModal'
import PWAInstall from './components/PWAInstall'

const STATS = [
  { num: '< 10s', label: 'POR ANÁLISIS' },
  { num: 'Gratis', label: 'PARA USAR' },
  { num: '4 fotos', label: 'CONTEXTO IA' },
]

export default function Home() {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    // Leer el tema que ya aplicó el script inline
    const current = document.documentElement.getAttribute('data-theme') || 'dark'
    setTheme(current)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('plendu_theme', next)
  }

  return (
    <div className="page">
      <OnboardingModal />
      <PWAInstall />

      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <header className="header">
        <div className="logo">
          Plendu
          <span className="logo-dot" />
        </div>
        <div className="header-right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <span className="beta-tag">BETA</span>
        </div>
      </header>

      <main className="main">
        <div className="col-left">
          <p className="eyebrow">
            <span className="eyebrow-line" />
            IA PARA VINTED
          </p>

          <h1 className="hero-title">
            Tu ficha lista<br />
            <em>en segundos</em>
          </h1>

          <p className="hero-sub">
            Sube hasta 4 fotos. La IA genera el título,
            descripción, precio y categoría perfectos para Vinted.
          </p>

          <div className="stats">
            {STATS.map(({ num, label }) => (
              <div key={label} className="stat">
                <p className="stat-num">{num}</p>
                <p className="stat-label">{label}</p>
              </div>
            ))}
          </div>

          <ImageUploader />
        </div>

        <div className="col-right" id="resultado-col" />
      </main>

      <footer className="footer">
        <span className="footer-logo">Plendu</span>
        <span>Hecho para vendedores reales · 2026</span>
      </footer>
    </div>
  )
}