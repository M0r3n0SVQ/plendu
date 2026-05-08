import Link from 'next/link'
import ImageUploader from './components/ImageUploader'
import OnboardingModal from './components/OnboardingModal'
import PWAInstall from './components/PWAInstall'
import ThemeToggle from './components/ThemeToggle'

const STATS = [
  { num: '< 10s', label: 'POR ANÁLISIS' },
  { num: 'Gratis', label: 'PARA USAR' },
  { num: '4 fotos', label: 'CONTEXTO IA' },
]

export default function Home() {
  return (
    <div className="page">
      {/* Accessibility: jump to main content */}
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>

      <OnboardingModal />
      <PWAInstall />

      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      <header className="header">
        <div className="logo" aria-label="Plendu">
          Plendu
          <span className="logo-dot" aria-hidden="true" />
        </div>
        <div className="header-right">
          <ThemeToggle />
          <span className="beta-tag" aria-label="Versión beta">BETA</span>
        </div>
      </header>

      <main
        className="main"
        id="main-content"
        aria-label="Generador de fichas para Vinted"
      >
        <section className="col-left" aria-label="Subir fotos y generar ficha">
          <p className="eyebrow" aria-hidden="true">
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

          <div className="stats" aria-label="Estadísticas del servicio">
            {STATS.map(({ num, label }) => (
              <div key={label} className="stat">
                <p className="stat-num">{num}</p>
                <p className="stat-label">{label}</p>
              </div>
            ))}
          </div>

          <ImageUploader />
        </section>

        <aside
          className="col-right"
          id="resultado-col"
          aria-label="Ficha generada"
          aria-live="polite"
        />
      </main>

      <footer className="footer">
        <span className="footer-logo">Plendu</span>
        <span>
          Hecho para vendedores reales · 2026
          {' · '}
          <Link href="/privacidad" className="footer-link">Privacidad</Link>
        </span>
      </footer>
    </div>
  )
}
