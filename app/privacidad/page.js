import Link from 'next/link'

export const metadata = {
  title: 'Privacidad — Plendu',
  description: 'Política de privacidad de Plendu. Qué datos tratamos, cómo y por qué.',
  alternates: { canonical: 'https://plendu.app/privacidad' },
  robots: { index: true, follow: true },
}

export default function Privacidad() {
  return (
    <div className="page">
      <header className="header">
        <Link href="/" className="logo" aria-label="Volver a Plendu">
          Plendu
          <span className="logo-dot" aria-hidden="true" />
        </Link>
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            letterSpacing: '0.12em',
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          ← VOLVER
        </Link>
      </header>

      <main className="legal-main" aria-label="Política de privacidad">
        <h1 className="legal-h1">Política de privacidad</h1>
        <p className="legal-meta">Última actualización: 1 de marzo de 2026</p>

        <section className="legal-section">
          <h2 className="legal-h2">Qué hace Plendu</h2>
          <p>
            Plendu es una herramienta gratuita que analiza fotos de prendas de
            ropa con inteligencia artificial para generar fichas listas para
            publicar en Vinted. No requiere registro, no usa cookies de
            seguimiento y no recopilamos datos personales identificables.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">Qué datos se procesan</h2>
          <ul className="legal-list">
            <li>
              <strong>Fotos de prendas:</strong> las imágenes que subes se
              comprimen en tu navegador, se envían cifradas por HTTPS a nuestro
              servidor y de ahí a la API de OpenAI únicamente para generar la
              ficha. No se almacenan en nuestros servidores ni en los de
              OpenAI más allá del tiempo de procesamiento (consulta su política
              en <a href="https://openai.com/es-ES/policies/privacy-policy/" target="_blank" rel="noopener noreferrer">openai.com/policies/privacy-policy</a>).
            </li>
            <li>
              <strong>Historial local:</strong> las últimas 10 fichas que
              generas se guardan en el <em>localStorage</em> de tu navegador,
              en tu propio dispositivo. Nadie más tiene acceso. Puedes borrarlo
              en cualquier momento desde el botón &quot;BORRAR TODO&quot; del historial,
              o vaciando los datos del sitio en la configuración del navegador.
            </li>
            <li>
              <strong>Preferencia de tema:</strong> guardamos en localStorage
              tu elección de modo claro/oscuro para que se mantenga al volver.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">Qué NO hacemos</h2>
          <ul className="legal-list">
            <li>No usamos cookies de tracking ni publicidad.</li>
            <li>No utilizamos analytics de terceros (Google Analytics, etc.).</li>
            <li>No vendemos ni compartimos tus datos con terceros.</li>
            <li>No conservamos tus fotos ni las usamos para entrenar modelos.</li>
            <li>No requerimos cuenta, email ni teléfono.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">Seguridad</h2>
          <p>
            Toda la comunicación viaja por HTTPS. Aplicamos cabeceras de
            seguridad estrictas (CSP, HSTS, X-Frame-Options) y limitamos el
            número de peticiones por dirección IP para prevenir abuso. El
            servidor valida y descarta automáticamente cualquier dato no
            esperado en las respuestas.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">Tus derechos</h2>
          <p>
            Como no almacenamos datos personales en nuestros servidores, el
            ejercicio de derechos (acceso, rectificación, supresión) se
            resuelve borrando el historial local de tu navegador. Si tienes
            alguna duda, escribe a <a href="mailto:alvaromorm@hotmail.com">alvaromorm@hotmail.com</a>.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">Cambios en esta política</h2>
          <p>
            Si modificamos esta política, actualizaremos la fecha de la parte
            superior. Los cambios sustanciales se comunicarán dentro de la
            propia aplicación.
          </p>
        </section>

        <p style={{ marginTop: '2.5rem' }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              letterSpacing: '0.12em',
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            ← VOLVER A PLENDU
          </Link>
        </p>
      </main>

      <footer className="footer">
        <span className="footer-logo">Plendu</span>
        <span>Hecho para vendedores reales · 2026</span>
      </footer>
    </div>
  )
}
