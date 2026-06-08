'use client'

import { useState, useEffect } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    // Read the theme already applied by the inline script in layout.js.
    // One-shot sync from DOM → state on mount; no external system to subscribe to.
    const current = document.documentElement.getAttribute('data-theme') || 'dark'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current)
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('plendu_theme', next)
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
