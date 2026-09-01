import OpenAI from 'openai'
import * as Sentry from '@sentry/nextjs'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { ESTADO_OPTIONS, CATEGORIA_OPTIONS, DUDOSO_FIELDS, ALERTA_MESSAGES } from '../../lib/vintedOptions'

const ALERTA_CODES = Object.keys(ALERTA_MESSAGES)

// Vercel: pin to Node runtime (OpenAI SDK + large bodies),
// allow up to 60s for vision inference, force per-request execution.
export const runtime  = 'nodejs'
export const maxDuration = 60
export const dynamic  = 'force-dynamic'

// Guard: fail fast at cold-start if key is missing
//
// The SDK already retries on connection errors, 429 and 5xx (see its
// shouldRetry()), but its defaults (10 min timeout per attempt, 2 retries)
// are tuned for arbitrary scripts, not a 60s serverless function that a
// client gives up on after 35s. A hung attempt at the default timeout would
// outlive both, so Vercel kills the whole function with a generic error
// instead of the retry ever getting a chance to run. Capping each attempt
// at 20s leaves room for one retry (worst case ~40s) safely inside maxDuration.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey:     process.env.OPENAI_API_KEY,
      timeout:    20_000,
      maxRetries: 1,
    })
  : null

// ─── Rate limiting ───────────────────────────────────────────────────────────
// Production: Upstash Redis sliding window — survives cold starts and is
// shared across all serverless instances.
// Dev / preview without Upstash vars: in-memory fallback (per-instance only).
const RATE_LIMIT_WINDOW_MS  = 60_000  // 1 minute window
const RATE_LIMIT_MAX        = 10      // max requests per IP per window

const upstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN

const ratelimit = upstashConfigured
  ? new Ratelimit({
      redis:    Redis.fromEnv(),
      limiter:  Ratelimit.slidingWindow(RATE_LIMIT_MAX, '60 s'),
      analytics: true,
      prefix:   'plendu:rl:analyze',
    })
  : null

// In-memory fallback (used only when Upstash is not configured)
const rateLimitMap = new Map()

function getClientIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isRateLimitedInMemory(ip) {
  const now = Date.now()
  if (rateLimitMap.size > 10_000) rateLimitMap.clear()

  const record = rateLimitMap.get(ip)
  if (!record || now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 })
    return false
  }
  if (record.count >= RATE_LIMIT_MAX) return true
  record.count++
  return false
}

// Returns { limited: boolean, retryAfter: number } — never throws.
// On Upstash error we fail OPEN: legitimate users shouldn't be blocked by
// our infra failing. The OpenAI cost cap is the actual safety net.
async function checkRateLimit(ip) {
  if (ratelimit) {
    try {
      const { success, reset } = await ratelimit.limit(ip)
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
      return { limited: !success, retryAfter }
    } catch (err) {
      console.error('[ratelimit] upstash failed, allowing request:', err?.message)
      return { limited: false, retryAfter: 60 }
    }
  }
  return { limited: isRateLimitedInMemory(ip), retryAfter: 60 }
}

// ─── Validation constants ─────────────────────────────────────────────────────
const ALLOWED_MIMES  = new Set(['image/jpeg', 'image/png', 'image/webp'])
// 7 MB of base64 chars ≈ 5.25 MB of binary (base64 = 4/3 overhead)
const MAX_BASE64_LEN = 7 * 1024 * 1024
const MAX_BODY_BYTES = 30 * 1024 * 1024  // 30 MB hard cap for 4 images combined

// Validate base64 format and size
export function isValidBase64(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > MAX_BASE64_LEN) {
    return false
  }
  // Accept only base64 alphabet + padding
  return /^[A-Za-z0-9+/]+=*$/.test(str)  // ={0,2} would be stricter but =* is safe here
}

// Validate a single foto payload
export function validateFoto(foto) {
  if (!foto || typeof foto !== 'object') return false
  if (!ALLOWED_MIMES.has(foto.mime))     return false
  if (!isValidBase64(foto.data))          return false
  return true
}

export async function POST(request) {
  // ── Rate limit ───────────────────────────────────────────────────────────────
  const { limited, retryAfter } = await checkRateLimit(getClientIP(request))
  if (limited) {
    return Response.json(
      { error: 'Demasiadas peticiones. Espera un momento.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  if (!openai) {
    return Response.json(
      { error: 'Servicio no disponible temporalmente.' },
      { status: 503 }
    )
  }

  // ── Payload size (Content-Length header, required) ───────────────────────────
  const clRaw = request.headers.get('content-length')
  if (!clRaw) {
    return Response.json({ error: 'Petición inválida.' }, { status: 411 })
  }
  const clHeader = parseInt(clRaw, 10)
  if (isNaN(clHeader) || clHeader > MAX_BODY_BYTES) {
    return Response.json({ error: 'Petición demasiado grande.' }, { status: 413 })
  }

  // ── Parse & validate body ────────────────────────────────────────────────────
  let fotos, notas
  try {
    const body = await request.json()
    fotos = body?.fotos
    // Free-text, so treat as untrusted: cap length and collapse newlines —
    // it's interpolated straight into the prompt below. The strict JSON
    // schema is the real backstop against prompt injection either way.
    notas = typeof body?.notas === 'string' ? body.notas.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  } catch {
    return Response.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  // Validate fotos is a plain object
  if (!fotos || typeof fotos !== 'object' || Array.isArray(fotos)) {
    return Response.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  // Principal is required
  if (!validateFoto(fotos?.principal)) {
    return Response.json(
      { error: 'Se requiere la foto principal en formato JPG, PNG o WebP (máx. 5 MB).' },
      { status: 400 }
    )
  }

  // Validate optional photos
  for (const key of ['etiqueta', 'trasera', 'detalle']) {
    if (fotos[key] != null && !validateFoto(fotos[key])) {
      return Response.json(
        { error: `Foto "${key}" inválida. Usa JPG, PNG o WebP de máx. 5 MB.` },
        { status: 400 }
      )
    }
  }

  // ── Build image content blocks ────────────────────────────────────────────────
  const imagenes = [
    { foto: fotos.principal, descripcion: 'vista principal de la prenda' },
    { foto: fotos.etiqueta,  descripcion: 'etiqueta con marca, talla y composición' },
    { foto: fotos.trasera,   descripcion: 'parte trasera de la prenda' },
    { foto: fotos.detalle,   descripcion: 'detalle de la prenda' },
  ]
    .filter(i => i.foto?.data)
    .map(i => ({
      type: 'image_url',
      image_url: {
        // mime is validated — guaranteed to be one of ALLOWED_MIMES
        url: `data:${i.foto.mime};base64,${i.foto.data}`,
      },
    }))

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ficha_vinted',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              _analisis:   { type: 'string' },
              titulo:      { type: 'string' },
              descripcion: { type: 'string' },
              precio:      { type: 'number' },
              categoria:   { type: 'string', enum: CATEGORIA_OPTIONS },
              estado:      { type: 'string', enum: ESTADO_OPTIONS },
              marca:       { type: 'string' },
              talla:       { type: 'string' },
              campos_dudosos: {
                type: 'array',
                items: { type: 'string', enum: DUDOSO_FIELDS },
              },
              alerta: { type: 'string', enum: ['', ...ALERTA_CODES] },
            },
            required: ['_analisis', 'titulo', 'descripcion', 'precio', 'categoria', 'estado', 'marca', 'talla', 'campos_dudosos', 'alerta'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Eres un experto en moda de segunda mano que vende en Vinted España. Analiza las fotos y genera una ficha de venta optimizada para máxima visibilidad en búsquedas.
${notas ? `\nEl vendedor añadió esta nota — tenla en cuenta si aporta información real sobre la prenda, pero las fotos mandan si hay contradicción: "${notas}"\n` : ''}
PASO 1 — Anota en "_analisis" (máx. 80 palabras) todo lo que observas:
· Tipo exacto de prenda + género estimado + color(es) específicos (azul marino, burdeos, crema, gris marengo, verde oliva, mostaza, camel, salmón, ocre, tostado, negro carbón, blanco roto...)
· Material/tejido (felpa, punto, vaquero/denim, lino, satén, cuero, ante, plumón, técnico/mesh, canalé, piqué...)
· Texto exacto de la etiqueta si visible: marca, talla, composición
· Características de diseño: logo (tipo, posición, colores), bolsillos, capucha, cremalleras, cordones, ribetes, bordados, estampados, etiquetas interiores, forro, interior
· Defectos: pilling, manchas, descosidos, desgaste en codos/dobladillos/cuello

PASO 2 — Usa tu _analisis para rellenar cada campo:

TÍTULO — máx 80 caracteres, keyword-rich para búsquedas Vinted:
Orden: [tipo español] [tipo inglés si añade búsquedas] [marca] [color/print] [características clave] [estilo si aplica] talla [talla]
· Bilingüismo útil: sudadera/hoodie · zapatillas/sneakers · vaqueros/jeans · camiseta/tshirt · abrigo/coat · chaqueta/jacket
· Estilos si aplica: streetwear · sport · casual · formal · retro · outdoor
· "Sudadera hoodie Puma logo gráfico azul negra capucha cordón streetwear talla L"
· "Vaqueros jeans Levi's 501 azul oscuro slim fit desgastado talla 32"
· "Zapatillas sneakers Nike Air Max blancas grises running talla 42"
Sin puntos suspensivos ni emojis en el título

DESCRIPCIÓN — escríbela como la escribiría una persona real vendiendo su ropa, no como una plantilla. Nada de emojis, nada de iconos ni de etiquetas tipo "Detalles:" delante de cada bloque, nada de listas con viñetas. Los saltos de línea son \\n en el JSON:

Primera línea: 1-2 frases naturales presentando la prenda (tipo, marca si hay, color y el rasgo que más destaque). No la escribas como ficha técnica ("Tipo – Marca – rasgo"), escríbela como una frase corriente.
[línea vacía]
2-4 frases cortas y sueltas mencionando 3-6 detalles observables (bolsillos, cierres, tejido, estampado...), con tono natural, como si se lo contaras a alguien.
[línea vacía]
Estado: [estado en minúscula], [condición en 4-6 palabras]
Talla: [talla o "(a completar)" si no visible]
Medidas en plano: (a completar)
[línea vacía]
Cierre de 1 frase, natural y variado (no repitas siempre la misma coletilla), sobre envío o disponibilidad para preguntas.

Condición de estado: "Nuevo con etiquetas" → "con etiqueta original" · "Nuevo sin etiquetas" → "sin uso aparente" · "Muy bueno" → "sin manchas ni desperfectos" · "Bueno" → "desgaste muy leve, sin manchas" · "Satisfactorio" → [describe el defecto principal]

PRECIO — entero o .5, sin €. Base Vinted España 2025:
Sin marca → camiseta 2-4 · sudadera 4-8 · pantalón 3-9 · vestido 4-11 · abrigo 7-16 · zapatos 4-10 · bolso 4-12
Fast-fashion (Zara, H&M, Mango, Bershka, Stradivarius, Pull&Bear, Springfield, Lefties) → ×1.5
Premium (Nike, Adidas, Levi's, Tommy Hilfiger, Calvin Klein, Lacoste, Guess, New Balance, Timberland) → ×2-3
Lujo (Gucci, Loewe, Prada, Burberry, Versace, Balenciaga, Max Mara, Boss, Massimo Dutti, Hackett) → ×8-30
Modificadores: "Nuevo con etiquetas" +40% · "Bueno" −15% · "Satisfactorio" −35%
Prenda fuera de temporada (abrigo en verano, bañador en invierno) → −15% adicional

ESTADO — solo lo que ves en las fotos:
"Nuevo con etiquetas" — etiqueta original intacta y visible
"Nuevo sin etiquetas" — sin uso, sin defectos, sin etiqueta
"Muy bueno" — 1-2 usos, sin pilling, sin manchas, sin desgaste perceptible
"Bueno" — uso regular, sin pilling ni manchas, desgaste muy leve en costuras o cierres
"Satisfactorio" — pilling apreciable, manchas, descosidos o desgaste notorio

CATEGORÍA — determina primero el género y elige exactamente una:
· MUJER: escote pronunciado, silueta entallada, cut-out, encaje, vestidos, faldas, lencería, print floral/femenino
· HOMBRE: corte recto o amplio sin pinzas, cuello mao, camisas de vestir, ropa táctica o de trabajo
· DUDOSO → si es amplia/oversize → Hombre; si es ceñida → Mujer; última opción: Hombre

Mujer: Camisetas y tops · Camisas y blusas · Jerseys y sudaderas · Vestidos · Faldas · Pantalones · Vaqueros · Chaquetas y abrigos · Ropa de deporte · Ropa interior · Bañadores · Trajes y conjuntos · Calzado mujer · Bolsos · Accesorios mujer
Hombre: Camisetas · Camisas · Jerseys y sudaderas hombre · Pantalones hombre · Vaqueros hombre · Chaquetas y abrigos hombre · Ropa de deporte hombre · Calzado hombre · Accesorios hombre
Niños: Ropa niña · Ropa niño · Calzado niños · Accesorios niños

MARCA — nombre exacto de etiqueta o logo. Vacío si no visible.
TALLA — tal como en etiqueta, convertida siempre a talla española/EU (Vinted España la espera así). Si la etiqueta ya muestra "EU" o un número de ropa normal (XS-XXXL, 34-48), úsalo tal cual.
Si es CALZADO y la etiqueta muestra varios sistemas a la vez (ej. "US 9 / UK 8 / EU 42.5"), coge siempre el valor EU.
Si es CALZADO y solo ves US o UK (sin EU visible), conviértelo a EU con esta tabla aproximada (hombre; para mujer resta a la talla EU resultante aprox. 1.5) y añade "talla" a campos_dudosos porque es una conversión, no una lectura directa:
US 6→EU 39 · US 6.5→EU 39.5 · US 7→EU 40 · US 7.5→EU 40.5 · US 8→EU 41 · US 8.5→EU 42 · US 9→EU 42.5 · US 9.5→EU 43 · US 10→EU 44 · US 10.5→EU 44.5 · US 11→EU 45 · US 12→EU 46 · US 13→EU 47
PRIORIDAD: etiqueta > estimación visual. Incertidumbre → vacío. Nunca inventes.

CAMPOS_DUDOSOS — array con los nombres exactos ("marca", "talla", "categoria", "estado") de los campos que son una estimación poco fiable: talla calculada a ojo sin etiqueta visible, marca deducida de un logo parcial o no confirmada, categoría dudosa por corte ambiguo, estado difícil de valorar por fotos poco claras. Vacío si tienes confianza razonable en todos. No incluyas un campo solo por rellenar el array.

ALERTA — string vacía salvo que veas uno de estos dos casos, en cuyo caso responde EXACTAMENTE ese código (nunca una frase propia, el texto que se muestra lo pone la app):
· "ropa_interior_usada" — ropa interior o bañador con aspecto de uso (sin etiquetas ni aspecto de "nuevo"), que Vinted solo permite vender nuevas y con etiqueta.
· "posible_replica" — sospecha razonable de réplica o falsificación de una marca de lujo (logo, tipografía o acabado que no coincide con el original).
No marques nada por precaución si no hay un indicio claro — evita falsos positivos, la mayoría de fichas no deberían llevar alerta.

EJEMPLO 1 (streetwear con marca y etiqueta visible):
{"_analisis":"Nike logo bordado en pecho. Felpa negra con capucha. Etiqueta: Nike, M. Bolsillo canguro. Cordón negro. Ribetes canalé en puños y bajo. Interior afelpado. Sin pilling ni manchas.","titulo":"Sudadera hoodie Nike logo bordado negra capucha cordón sport streetwear talla M","descripcion":"Sudadera Nike con capucha en negro, con el logo bordado en el pecho y capucha con cordón ajustable.\\n\\nTiene bolsillo canguro delantero y el interior es de felpa suave, muy calentita. Puños y bajo con ribete canalé.\\n\\nEstado: muy bueno, sin manchas ni desperfectos\\nTalla: M\\nMedidas en plano: (a completar)\\n\\nEnvío en 24-48h, cualquier duda pregunta sin problema.","precio":20,"categoria":"Jerseys y sudaderas hombre","estado":"Muy bueno","marca":"Nike","talla":"M","campos_dudosos":[],"alerta":""}

EJEMPLO 2 (vestido sin marca ni etiqueta visible — nótese que "talla" lleva una estimación Y aparece en campos_dudosos a la vez):
{"_analisis":"Vestido midi verde oliva, tirantes finos, escote cruzado. Tejido satinado fluido, cae bien. Sin etiqueta visible. Cremallera lateral oculta. Sin manchas ni enganches.","titulo":"Vestido midi verde oliva satinado tirantes escote cruzado talla M","descripcion":"Vestido midi verde oliva con tirantes finos y escote cruzado que estiliza mucho. El tejido es satinado y cae genial, sin arrugas raras.\\n\\nCierre de cremallera oculta en el lateral. Perfecto para una cena o evento, aunque también se puede llevar más casual con una chaqueta encima.\\n\\nEstado: nuevo sin etiquetas, sin uso aparente\\nTalla: M\\nMedidas en plano: (a completar)\\n\\nEnvío en 24-48h, escríbeme si tienes dudas.","precio":9,"categoria":"Vestidos","estado":"Nuevo sin etiquetas","marca":"","talla":"M","campos_dudosos":["talla"],"alerta":""}

Responde SOLO con JSON válido: {"_analisis":"","titulo":"","descripcion":"","precio":0,"categoria":"","estado":"","marca":"","talla":"","campos_dudosos":[],"alerta":""}`,
            },
            ...imagenes,
          ],
        },
      ],
      max_tokens: 800,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return Response.json(
        { error: 'La IA no devolvió respuesta. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    // json_schema (strict) mode guarantees valid JSON matching the schema —
    // categoria/estado are constrained to CATEGORIA_OPTIONS/ESTADO_OPTIONS
    let ficha
    try {
      ficha = JSON.parse(content)
    } catch {
      return Response.json(
        { error: 'Error procesando la respuesta de la IA. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    // Validate required fields before sending to client
    if (
      typeof ficha?.titulo      !== 'string' || !ficha.titulo.trim() ||
      typeof ficha?.descripcion !== 'string' || !ficha.descripcion.trim() ||
      typeof ficha?.precio      !== 'number' || !isFinite(ficha.precio) || ficha.precio < 0
    ) {
      return Response.json(
        { error: 'La IA devolvió una respuesta incompleta. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    // Sanitize all fields before returning to client
    const safeFicha = {
      titulo:      ficha.titulo.trim().slice(0, 100),
      descripcion: ficha.descripcion.trim().slice(0, 1000),
      precio:      Math.max(0, Math.min(9999, Number(ficha.precio))),
      estado:      typeof ficha.estado    === 'string' ? ficha.estado.trim().slice(0, 100)    : '',
      categoria:   typeof ficha.categoria === 'string' ? ficha.categoria.trim().slice(0, 100) : '',
      marca:       typeof ficha.marca     === 'string' ? ficha.marca.trim().slice(0, 100)     : '',
      talla:       typeof ficha.talla     === 'string' ? ficha.talla.trim().slice(0, 100)     : '',
      camposDudosos: Array.isArray(ficha.campos_dudosos)
        ? [...new Set(ficha.campos_dudosos.filter(f => DUDOSO_FIELDS.includes(f)))]
        : [],
      // Only ever one of our own fixed codes — never the model's own prose —
      // so a crafted "notas" input can't get free text into an alert banner
      // that renders with authoritative, role="alert" styling.
      alerta: ALERTA_CODES.includes(ficha.alerta) ? ficha.alerta : '',
    }

    return Response.json(safeFicha, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const status = err.status === 429 ? 429 : err.status === 401 ? 401 : 500
    const message =
      err.status === 429 ? 'Demasiadas peticiones. Espera un momento.' :
      err.status === 401 ? 'Clave de API inválida. Contacta con soporte.' :
      'Error al analizar la prenda. Inténtalo de nuevo.'

    // Only surface unexpected errors to Sentry. 429/401 are upstream signals
    // that we already handle by design — they'd just be noise.
    if (status === 500) {
      Sentry.captureException(err, { tags: { route: 'api/analyze' } })
    }

    return Response.json({ error: message }, { status })
  }
}
