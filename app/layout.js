import './globals.css'

export const metadata = {
  metadataBase: new URL('https://plendu.app'),
  title: 'Plendu — Fichas para Vinted en segundos',
  description: 'Sube hasta 4 fotos de tu prenda y la IA genera el título, descripción, precio y categoría perfectos para Vinted España. Gratis, sin registro.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Plendu',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'Plendu — Fichas para Vinted en segundos',
    description: 'Sube hasta 4 fotos. La IA genera tu ficha de Vinted en menos de 10 segundos. Gratis.',
    type: 'website',
    siteName: 'Plendu',
    locale: 'es_ES',
    url: 'https://plendu.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plendu — Fichas para Vinted en segundos',
    description: 'Sube hasta 4 fotos. La IA genera tu ficha de Vinted en menos de 10 segundos. Gratis.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: 'https://plendu.app',
  },
  keywords: ['vinted', 'ficha vinted', 'vender ropa', 'segunda mano', 'inteligencia artificial', 'ia moda'],
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#080808' },
    { media: '(prefers-color-scheme: light)', color: '#f5f2ed' },
  ],
  width: 'device-width',
  initialScale: 1,
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Plendu',
  url: 'https://plendu.app',
  description: 'Genera fichas perfectas para Vinted en segundos con inteligencia artificial. Sube hasta 4 fotos y obtén título, descripción, precio, categoría, estado, marca y talla.',
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'Web',
  inLanguage: 'es',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
  },
  featureList: [
    'Análisis de imágenes con IA',
    'Generación de título optimizado para Vinted',
    'Estimación de precio de mercado',
    'Detección de marca y talla',
    'Historial de fichas generadas',
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Declare supported color schemes for browser UI adaptation */}
        <meta name="color-scheme" content="dark light" />
        {/* Preconnect: reduces Google Fonts latency */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inline script: applies saved theme before first paint (no flash).
            Falls back to OS preference (prefers-color-scheme) on first visit. */}
        <script
          dangerouslySetInnerHTML={{
            // Whitelist the only two valid values to prevent localStorage injection
            __html: `
              try {
                var t = localStorage.getItem('plendu_theme');
                if (t !== 'light' && t !== 'dark') {
                  t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
                }
                document.documentElement.setAttribute('data-theme', t);
              } catch(e) {}
            `,
          }}
        />
        {/* Apple touch icon for iOS "Add to Home Screen" */}
        <link rel="apple-touch-icon" href="/api/pwa-icon?size=192" />
        {/* Structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <noscript>
          <p style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            textAlign: 'center', fontFamily: 'sans-serif',
            color: '#f2ede4', background: '#080808',
            padding: '2rem 2.5rem', borderRadius: '12px',
            zIndex: 10000, lineHeight: 1.7,
          }}>
            Plendu requiere JavaScript activado para funcionar.
          </p>
        </noscript>
        {children}
        {/* Register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
