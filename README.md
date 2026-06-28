# Plendu

[![CI](https://github.com/M0r3n0SVQ/plendu/actions/workflows/ci.yml/badge.svg)](https://github.com/M0r3n0SVQ/plendu/actions/workflows/ci.yml)

App para generar fichas de Vinted a partir de fotos. Subes hasta 4 imágenes de una prenda y la IA te devuelve título, descripción, precio, categoría, estado, marca y talla. Gratis, sin registro.

Web: [plendu.app](https://plendu.app)

## Cómo funciona

Las fotos se redimensionan y comprimen en el navegador antes de enviarse. La API solo las pasa a OpenAI durante el análisis, no las guarda. El historial de las últimas 10 fichas se queda en `localStorage`.

Es PWA, así que se puede instalar en el móvil. Tiene tema claro y oscuro, y una pantalla de fallback cuando no hay conexión.

## Stack

- Next.js 16 con App Router (output standalone)
- React 19
- Tailwind 4 + CSS plano
- OpenAI gpt-4o-mini para visión
- Upstash Redis para rate limit
- Sentry para monitoring
- Service Worker propio

## Desarrollo

Necesitas Node 22 y npm 10.

```bash
git clone https://github.com/M0r3n0SVQ/plendu.git
cd plendu
cp .env.example .env.local
# pon tu OPENAI_API_KEY
npm install
npm run dev
```

Y en [http://localhost:3000](http://localhost:3000).

Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`.

Si prefieres Docker, hay `docker compose up --build`. El Dockerfile es multi-stage con el output standalone de Next.

## Variables de entorno

Solo `OPENAI_API_KEY` es obligatoria. Las demás añaden funcionalidad si están, y se omiten si no:

| Variable | Para qué |
|---|---|
| `OPENAI_API_KEY` | Llamadas a la IA. Sin ella, `/api/analyze` devuelve 503. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate limit compartido entre instancias. Sin esto cae a uno en memoria. |
| `NEXT_PUBLIC_SENTRY_DSN` | Captura de errores. Sin esto Sentry no se inicializa. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Subir sourcemaps a Sentry en el build. Opcional. |

## Desplegar en Vercel

Importa el repo en [vercel.com/new](https://vercel.com/new), mete las variables de entorno y dale a Deploy. Ya está. El `vercel.json` del repo configura la región (cdg1, París) y sube el timeout de `/api/analyze` a 60 s con 1 GB de memoria.

Si vas a poner dominio propio, mira `app/layout.js` y cambia el `metadataBase` y los canonical de `https://plendu.app` al tuyo.

### Upstash

Si quieres el rate limit serio, crea una BD Redis gratis en [console.upstash.com](https://console.upstash.com) (yo uso `eu-west-1`), copia las dos credenciales REST y pégalas en Vercel. El endpoint hace 10 req/min por IP con sliding window. Si Upstash se cae, deja pasar la petición en vez de bloquear (el límite de OpenAI sigue ahí de tope).

### Sentry

Proyecto Next.js en [sentry.io](https://sentry.io), copias el DSN de Client Keys y lo pones en `NEXT_PUBLIC_SENTRY_DSN`. Solo se mandan los 500. Los 429 y 401 están filtrados porque son señales esperadas y solo harían ruido.

## Estructura

```
app/
  api/
    analyze/route.js     POST con las fotos, devuelve la ficha
    pwa-icon/route.js    Icono PWA dinámico
  components/
    ImageUploader.js     Subida, compresión, panel resultado, historial
    OnboardingModal.js   Modal de la primera visita
    PWAInstall.js        Prompt de "añadir a pantalla de inicio"
    ThemeToggle.js
  privacidad/page.js
  layout.js              Metadata, JSON-LD, SW, theme inline
  page.js
  error.js / global-error.js / not-found.js
  icon.js                Favicon
  opengraph-image.js
  sitemap.js
public/
  manifest.json
  sw.js                  Service Worker
  robots.txt
```

## Seguridad de `/api/analyze`

- Rate limit por IP (Upstash o memoria como fallback).
- `Content-Length` obligatorio, con tope de 30 MB para 4 imágenes.
- MIMEs solo `jpeg`, `png` y `webp`.
- Validación de la base64 con regex antes de tocar nada.
- Sanitización campo a campo del JSON que devuelve la IA antes de mandarlo al cliente.
- `Cache-Control: no-store`.
- Cabeceras globales en `next.config.mjs`: CSP, HSTS, COOP, CORP, Permissions-Policy, X-Frame-Options.

## Roadmap

Cosas que iré haciendo cuando me apetezca.

Para antes de mover la app más en serio:

- [x] Rate limit con Upstash
- [x] Sentry
- [x] CI con GitHub Actions
- [ ] Tests del endpoint `/api/analyze` con Vitest
- [ ] Analítica (Vercel Analytics o Plausible)
- [ ] Logo/favicon de verdad, no el dinámico actual

Si crece y tiene sentido monetizar:

- [ ] Login opcional (NextAuth) para sincronizar historial entre dispositivos
- [ ] Historial en Postgres cuando hay cuenta
- [ ] Cuota: gratis hasta X fichas/día, ilimitado con cuenta o suscripción
- [ ] Stripe con un plan "Pro" barato
- [ ] Probar Claude Sonnet o gpt-4o para descripciones más finas
- [ ] Detección de defectos como segundo pase
- [ ] i18n para Vinted FR/IT/DE/PT

Si llega a ser un producto serio:

- [ ] Integración con Vinted (API si la abren, o extensión que rellene el formulario)
- [ ] Multi-prenda en una sola subida
- [ ] Sugerencia de precio basada en búsquedas reales
- [ ] App nativa para iOS/Android

Mantenimiento:

- [ ] Migrar a TypeScript poco a poco, empezando por `app/api`
- [ ] Sacar el panel derecho del portal y meterlo en estado React
- [ ] Validar la respuesta de la IA con Zod
- [ ] Partir `ImageUploader.js` en archivos separados

## Privacidad

Las fotos no se guardan en ningún servidor mío. Llegan a la API, se mandan a OpenAI una vez y se descartan. El historial y la preferencia de tema viven solo en tu navegador.

Más en `/privacidad`.

## Licencia

Sin licencia abierta de momento. Si te interesa contribuir, abre un issue.
