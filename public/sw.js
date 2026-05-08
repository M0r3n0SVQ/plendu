const CACHE_NAME = 'plendu-v3'
const FONT_CACHE = 'plendu-fonts-v1'

// Font origins — cache aggressively (served with long TTL by Google)
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

// Minimal offline fallback page (inlined — no extra round-trip)
const OFFLINE_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Plendu — Sin conexión</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080808;color:#f2ede4;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    h1{font-size:2rem;margin-bottom:1rem;color:#b8965a;font-family:Georgia,serif}
    p{color:#8a8580;font-size:0.88rem;line-height:1.7;max-width:280px;margin:0 auto}
    button{margin-top:1.75rem;padding:0.75rem 2rem;background:#b8965a;color:#080808;border:none;border-radius:12px;font-size:0.85rem;font-weight:500;cursor:pointer;transition:opacity .2s}
    button:hover{opacity:.85}
  </style>
</head>
<body>
  <div>
    <h1>Plendu·</h1>
    <p>Sin conexión a internet.<br>Comprueba tu red e inténtalo de nuevo.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept API calls (OpenAI proxy, icon generation)
  if (url.pathname.startsWith('/api/')) return

  // Google Fonts: cache-first, long TTL
  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // HTML navigation: network-first → cached root → offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request) || await caches.match('/')
          if (cached) return cached
          return new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        })
    )
    return
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)

      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(() => null)

      // Return cached immediately; update in background
      return cached || fetchPromise
    })
  )
})
