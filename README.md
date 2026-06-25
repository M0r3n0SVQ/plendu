# Plendu

[![CI](https://github.com/M0r3n0SVQ/plendu/actions/workflows/ci.yml/badge.svg)](https://github.com/M0r3n0SVQ/plendu/actions/workflows/ci.yml)

> Genera fichas perfectas para Vinted en segundos a partir de fotos.

Plendu es una webapp gratuita que analiza hasta 4 fotos de una prenda con IA y devuelve el **título**, **descripción**, **precio sugerido**, **categoría**, **estado**, **marca** y **talla** listos para publicar en Vinted España.

- Sin registro, sin tracking, sin backend de usuarios.
- Las fotos se procesan en cliente (resize + JPEG q=0.82) y se envían a la API de OpenAI **solo durante el análisis**: no se guardan.
- El historial de las últimas 10 fichas vive en `localStorage` del navegador.
- PWA instalable, soporte offline básico (página de fallback), tema claro/oscuro.

## Stack

- **Next.js 16** (App Router, standalone output)
- **React 19**
- **Tailwind v4** + CSS plano para el resto
- **OpenAI** `gpt-4o-mini` (visión)
- **Service Worker** propio para offline + cache de fuentes

---

## Desarrollo local

Requisitos: Node 22+, npm 10+.

```bash
git clone https://github.com/M0r3n0SVQ/plendu.git
cd plendu
cp .env.example .env.local
# edita .env.local y pon tu OPENAI_API_KEY
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Scripts

| Comando         | Qué hace                              |
| --------------- | ------------------------------------- |
| `npm run dev`   | Servidor de desarrollo con HMR        |
| `npm run build` | Build de producción (standalone)      |
| `npm run start` | Sirve el build de producción          |
| `npm run lint`  | ESLint sobre todo el código           |

### Docker

```bash
docker compose up --build
```

El `Dockerfile` es multi-stage y usa el output `standalone` de Next.

---

## Despliegue en Vercel

1. **Fork / clona** este repo en tu cuenta de GitHub.
2. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
3. **Variables de entorno** — añade en *Project Settings → Environment Variables* (production + preview + development):
   - `OPENAI_API_KEY` → tu key de OpenAI.
   - `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` → para rate limit distribuido (ver más abajo).
   - `NEXT_PUBLIC_SENTRY_DSN` *(opcional)* → para captura de errores (ver más abajo).
4. **Deploy.** Vercel detecta Next.js automáticamente; no hace falta tocar el comando de build.

### Rate limit con Upstash Redis

El endpoint `/api/analyze` aplica un sliding window de **10 req/min por IP**. Sin Upstash, cae a un limitador en memoria por instancia — bypaseable en serverless. Con Upstash:

1. Crea una BD Redis gratis en [console.upstash.com](https://console.upstash.com), región `eu-west-1`.
2. Copia el `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. Pégalas en Vercel como vars de entorno.

Si Upstash falla (timeout/caída), el endpoint *falla abierto* (deja pasar la petición) en lugar de bloquear usuarios legítimos por un problema de infra.

### Monitoring de errores con Sentry

Errores 500 de `/api/analyze` y errores de cliente se mandan a Sentry — útiles para detectar JSON roto de OpenAI, hydration mismatches o regresiones antes de que los reporte un usuario.

1. Crea un proyecto Next.js en [sentry.io](https://sentry.io) (plan free).
2. Copia el DSN desde *Settings → Client Keys (DSN)*.
3. Añade `NEXT_PUBLIC_SENTRY_DSN` en Vercel.

Sin esa variable Sentry no hace nada — la app se comporta igual. Los 429 (rate limit) y 401 (auth) **no** se mandan a Sentry: son señales esperadas, solo serían ruido.

Para sourcemaps (mejor stack trace): añade también `SENTRY_ORG`, `SENTRY_PROJECT` y `SENTRY_AUTH_TOKEN`.

El repo incluye un `vercel.json` que:

- Despliega en la región `cdg1` (París) — la más cercana a usuarios en España.
- Sube `maxDuration` de la función `/api/analyze` a **60 s** (la visión puede tardar 10-30 s en cargas altas).
- Asigna **1024 MB de memoria** a esa función.

> ⚠️ **Plan Hobby de Vercel:** `maxDuration` máximo es 60 s y los límites de invocaciones son generosos pero finitos. Si esperas tráfico alto, plantéate el plan Pro o un rate limit distribuido (ver roadmap).

### Dominio personalizado

Apunta tu dominio en Vercel (*Project → Domains*). El `metadataBase` y los enlaces canónicos están en `app/layout.js` apuntando a `https://plendu.app` — cámbialo si despliegas en otro dominio.

---

## Arquitectura rápida

```
app/
├─ api/
│  ├─ analyze/route.js     ← POST: recibe 1-4 fotos en base64, devuelve la ficha
│  └─ pwa-icon/route.js    ← Genera el icono PWA dinámico
├─ components/
│  ├─ ImageUploader.js     ← Subida, compresión, llamada API, panel resultado, historial
│  ├─ OnboardingModal.js   ← Modal de bienvenida (primera visita)
│  ├─ PWAInstall.js        ← Prompt "Añadir a pantalla de inicio"
│  └─ ThemeToggle.js       ← Selector claro / oscuro
├─ privacidad/page.js      ← Política de privacidad
├─ layout.js               ← Metadata, JSON-LD, registro SW, theme inline
├─ page.js                 ← Landing
├─ error.js / global-error.js / not-found.js
├─ icon.js                 ← Favicon dinámico
├─ opengraph-image.js      ← OG image dinámica
└─ sitemap.js
public/
├─ manifest.json           ← Manifest PWA
├─ sw.js                   ← Service Worker (offline + cache fuentes)
└─ robots.txt
```

### Defensas ya implementadas en `/api/analyze`

- Rate limit por IP en memoria (10 req/min).
- Validación estricta de `Content-Length` (411/413).
- Whitelist de MIMEs (`jpeg`/`png`/`webp`).
- Validación de la cadena base64 con regex.
- Sanitización de cada campo del JSON antes de devolverlo al cliente.
- `Cache-Control: no-store` en la respuesta.
- Cabeceras de seguridad globales en `next.config.mjs` (CSP estricta, HSTS, COOP, Permissions-Policy, etc.).

---

## Roadmap

Mejoras propuestas, ordenadas por impacto y esfuerzo. Pensadas para irse aplicando poco a poco según crezca el uso.

### Corto plazo — antes de promocionarlo en serio

- [x] ~~**Rate limit distribuido** con [Upstash Redis](https://upstash.com/).~~ ✅ Hecho — sliding window 10 req/min/IP, fail-open ante caídas de Upstash.
- [ ] **Analítica privada** — Vercel Analytics o Plausible. Sin cookies, sin GDPR cookie banner.
- [x] ~~**Monitoring de errores** — Sentry gratuito hasta 5k eventos/mes.~~ ✅ Hecho — captura errores 500 de la API y de cliente, no-ops sin DSN configurado.
- [ ] **Tests** — al menos del endpoint `/api/analyze` (validación de payload, sanitización) con Vitest + supertest. Y un E2E feliz con Playwright.
- [x] ~~**CI** — GitHub Actions que corra `lint` + `build` + tests en cada PR.~~ ✅ Hecho — `lint` + `build` en cada PR y push a master. Falta añadir tests.
- [ ] **Logo / favicon de marca** — actualmente el icono se genera dinámicamente con una "P" tipográfica. Mejor un SVG curado.

### Medio plazo — escalar y monetizar

- [ ] **Cuenta de usuario opcional** (NextAuth con Google/email magic link) para sincronizar el historial entre dispositivos.
- [ ] **Persistencia del historial** en Postgres (Vercel Postgres / Neon / Supabase) cuando hay cuenta.
- [ ] **Cuota por usuario / IP** (p.ej. 5 fichas/día gratis, ilimitado con cuenta verificada o pago).
- [ ] **Pasarela de pago** — Stripe con un plan "Plendu Pro" (~3 €/mes) que quite cuota y dé:
  - Mejor modelo (`gpt-4o` o `claude-sonnet-4-6` para descripciones más finas).
  - Historial ilimitado en la nube.
  - Exportar a CSV.
- [ ] **A/B test del prompt** — variar pequeños bloques del prompt y medir el % de fichas no editadas por el usuario antes de copiar (proxy de calidad).
- [ ] **Mejor modelo de visión opcional** — probar `claude-sonnet-4-6` con imágenes; suele describir materiales y defectos mejor que `gpt-4o-mini`.
- [ ] **Detección de defectos visuales** — segundo pase enfocado solo en buscar manchas, pilling, descosidos. Ayuda a justificar el "Estado".
- [ ] **i18n** — empezar por Vinted FR/IT/DE/PT, que son los mercados grandes. Implica adaptar precios y categorías por país.

### Largo plazo — producto serio

- [ ] **Integración directa con Vinted** — vía su API o (si no la abren) extensión de navegador que rellene el formulario por ti.
- [ ] **Multi-prenda en lote** — sube fotos de 10 prendas mezcladas, el sistema las agrupa y genera 10 fichas.
- [ ] **Aprendizaje del usuario** — recordar el estilo de descripción que más copia (más / menos emojis, más / menos técnico).
- [ ] **Sugerencia de precio dinámica** — scraping ético de búsquedas Vinted similares para afinar el precio en lugar de usar tabla estática.
- [ ] **App móvil nativa** — la PWA ya da el 80 %, pero una nativa permitiría cámara nativa, share extension de iOS, etc.
- [ ] **Marketplace de plantillas de descripción** — los vendedores comparten plantillas favoritas, otros las usan.

### Higiene técnica continua

- [ ] **TypeScript** — la base es pequeña, migración manejable. Empezar por `app/api/` y los componentes con más estado.
- [ ] **Refactor del aside vacío** en `page.js` → mover el panel derecho a estado React puro en lugar de portal sobre un `aside` SSR vacío.
- [ ] **Tipar la respuesta de la IA con Zod** en el server, en lugar del check manual de strings/numbers.
- [ ] **Reducir el bundle** — `ImageUploader.js` son 1178 líneas; partir en sub-componentes (`<FichaPanel>`, `<EmptyPanel>`, `<SkeletonPanel>`, `<Toast>` ya están separados internamente pero podrían ir en archivos propios).

---

## Privacidad

Las fotos:
- Se redimensionan y comprimen **en tu navegador** antes de salir.
- Solo se envían a `/api/analyze`, que las reenvía a OpenAI **una sola vez** y descarta la respuesta.
- No se guardan en ningún servidor de Plendu (no hay base de datos).

El historial y el tema viven en `localStorage` de tu navegador. Borra los datos del sitio para eliminarlos.

Detalles completos en `/privacidad`.

## Licencia

Sin licencia pública por ahora — todos los derechos reservados. Abrir un issue si te interesa contribuir.
