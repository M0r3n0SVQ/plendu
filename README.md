# Plendu

[![CI](https://github.com/M0r3n0SVQ/plendu/actions/workflows/ci.yml/badge.svg)](https://github.com/M0r3n0SVQ/plendu/actions/workflows/ci.yml)

App para generar fichas de Vinted a partir de fotos. Subes hasta 4 imágenes de una prenda y la IA te devuelve título, descripción, precio, categoría, estado, marca y talla. Gratis, sin registro. Disponible para Vinted España y Francia.

Web: [plendu.app](https://plendu.vercel.app/)

<p align="center">
  <img src="docs/screenshots/desktop.png" alt="Plendu en escritorio: subida de fotos a la izquierda, ficha generada por IA a la derecha" width="800">
</p>
<p align="center">
  <img src="docs/screenshots/mobile.png" alt="Plendu en móvil: ficha generada con título, descripción y precio" width="260">
</p>

## Cómo funciona

Las fotos se comprimen en el navegador y se envían a OpenAI solo para el análisis: no se guardan. El historial de las últimas 10 fichas vive en `localStorage`, con editor de fotos integrado y sincronización opcional entre dispositivos (un código de 12 caracteres, sin cuenta ni email).

Cada ficha se puede compartir por Web Share API o exportar como imagen para stories de Instagram/TikTok. También hay unas guías propias en `/guias` para búsquedas informativas (fotografiar ropa, poner precio, tomar medidas).

Es PWA, instalable en el móvil, con tema claro y oscuro y una pantalla de fallback sin conexión.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript en la API y la lógica compartida · Tailwind + CSS plano · OpenAI gpt-4o-mini para visión, validado con Zod · Redis (Upstash) para rate limit y sincronización · Sentry · Vitest + Lighthouse CI.

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

Y en [http://localhost:3000](http://localhost:3000). Scripts: `npm run dev`, `npm run build`, `npm run test`, `npm run lint`. También hay `docker compose up --build` si prefieres Docker.

Solo `OPENAI_API_KEY` es obligatoria para arrancar. `UPSTASH_REDIS_REST_URL`/`TOKEN` añaden rate limit compartido y sincronización (sin ellas cae a un rate limit en memoria); `NEXT_PUBLIC_SENTRY_DSN` activa la captura de errores. El resto de variables están comentadas en `.env.example`.

Para desplegar: importa el repo en [vercel.com/new](https://vercel.com/new), añade las variables de entorno y listo. `vercel.json` ya configura la región y el timeout que necesita `/api/analyze`.

## Seguridad

`/api/analyze` tiene rate limit por IP, valida tamaño y tipo de cada foto antes de tocarlas, y sanea campo a campo lo que devuelve la IA antes de mandarlo al cliente, por si alguna vez responde algo raro. Cabeceras de seguridad (CSP, HSTS, X-Frame-Options...) puestas a mano en `next.config.mjs`, no por defecto del framework.

## Roadmap

Cosas que iré haciendo cuando me apetezca.

- [x] Segundo mercado (Francia) además de España
- [x] Sincronización de historial entre dispositivos, sin cuenta
- [x] Contenido propio para SEO (`/guias`) y compartir como story
- [x] CI, tests y Lighthouse en cada cambio
- [ ] Cuota gratis + suscripción si el proyecto crece
- [ ] Más mercados de Vinted (IT, DE, UK, PT)
- [ ] Detección de defectos como segundo pase de la IA
- [ ] Integración directa con Vinted, si algún día abren API

## Privacidad

Las fotos no se guardan en ningún servidor mío: llegan a la API, se mandan a OpenAI una vez y se descartan. El historial y el tema viven en tu navegador. Más en [`/privacidad`](https://plendu.vercel.app/privacidad).

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes leer, clonar y usar el código para cualquier fin no comercial, pero no para montar un servicio de pago con él. Si quieres usarlo comercialmente, escríbeme.
