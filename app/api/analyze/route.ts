import OpenAI from 'openai'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import {
  MERCADOS, MERCADO_DEFAULT, isMercadoId,
  DUDOSO_FIELDS, ALERTA_MESSAGES, type AlertaCode, type MercadoId,
} from '../../lib/vintedOptions'
import { createRateLimiter, getClientIP, rateLimitResponse, checkContentLength } from '../../lib/rateLimit'

const ALERTA_CODES = Object.keys(ALERTA_MESSAGES) as AlertaCode[]

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
const checkRateLimit = createRateLimiter({ prefix: 'analyze', windowMs: 60_000, max: 10 })

// ─── Validation constants ─────────────────────────────────────────────────────
const ALLOWED_MIMES  = new Set(['image/jpeg', 'image/png', 'image/webp'])
// 7 MB of base64 chars ≈ 5.25 MB of binary (base64 = 4/3 overhead)
const MAX_BASE64_LEN = 7 * 1024 * 1024
const MAX_BODY_BYTES = 30 * 1024 * 1024  // 30 MB hard cap for 4 images combined

interface FotoPayload {
  mime: string
  data: string
}

// Validate base64 format and size
export function isValidBase64(str: unknown): str is string {
  if (typeof str !== 'string' || str.length === 0 || str.length > MAX_BASE64_LEN) {
    return false
  }
  // Accept only base64 alphabet + padding
  return /^[A-Za-z0-9+/]+=*$/.test(str)  // ={0,2} would be stricter but =* is safe here
}

// Validate a single foto payload
export function validateFoto(foto: unknown): foto is FotoPayload {
  if (!foto || typeof foto !== 'object') return false
  const f = foto as Record<string, unknown>
  if (typeof f.mime !== 'string' || !ALLOWED_MIMES.has(f.mime)) return false
  if (!isValidBase64(f.data))                                   return false
  return true
}

// ─── AI response validation ──────────────────────────────────────────────────
// Structured Outputs (json_schema, strict) already guarantees the shape and
// enum values coming back from the model — this is defense-in-depth against
// length/type edge cases before anything reaches the client, and the single
// declared source of truth for what a "safe" ficha looks like.
const fichaResponseSchema = z.object({
  // Trimmed-then-empty still rejects the whole response (titulo/descripcion
  // are the two fields with no usable fallback) — but an over-length value
  // truncates instead of rejecting, same as precio clamps instead of
  // rejecting below. Structured Outputs enforces the field's *type*, not a
  // max length, so the model exceeding the prompt's "máx 80/800 caracteres"
  // guidance is a real, reachable case, not just defensive paranoia.
  // The prompt's título template ends in "talla [talla]", and the model has
  // been observed copying the descripción's "(a completar)" placeholder
  // convention into that slot when talla is unknown, instead of dropping the
  // segment — strip it here too since prompt compliance isn't guaranteed.
  titulo:      z.string().trim().min(1)
    .transform(v => v.replace(/\s*talla\s*\(a completar\)/i, '').trim())
    .transform(v => v.slice(0, 100)),
  descripcion: z.string().trim().min(1).transform(v => v.slice(0, 1000)),
  // Clamps both ends instead of rejecting — .min(0) as a validator (rather
  // than folding into the transform below) would reject the whole response
  // on a negative value, same asymmetric-reject bug the truncate comments
  // above are about, just on the lower bound instead of string length.
  precio:      z.number().finite().transform(v => Math.min(9999, Math.max(0, v))),
  // Same truncate-not-reject/wipe rule as titulo/descripcion — only a
  // non-string value falls back to '' via .catch(); an overlong string is
  // truncated to 100 chars, not discarded.
  estado:      z.string().trim().transform(v => v.slice(0, 100)).catch(''),
  categoria:   z.string().trim().transform(v => v.slice(0, 100)).catch(''),
  marca:       z.string().trim().transform(v => v.slice(0, 100)).catch(''),
  talla:       z.string().trim().transform(v => v.slice(0, 100)).catch(''),
  campos_dudosos: z.array(z.string()).catch([])
    .transform(arr => [...new Set(arr.filter(f => (DUDOSO_FIELDS as readonly string[]).includes(f)))]),
  // Only ever one of our own fixed codes — never the model's own prose — so
  // a crafted "notas" input can't get free text into an alert banner that
  // renders with authoritative, role="alert" styling.
  alerta: z.string().catch('')
    .transform((a): AlertaCode | '' => (ALERTA_CODES.includes(a as AlertaCode) ? (a as AlertaCode) : '')),
})

// ─── Prompt ───────────────────────────────────────────────────────────────────
// Almost everything below stays in Spanish regardless of mercado — it's
// instructions TO the model (how to classify a photo, internal reasoning in
// "_analisis") that never reach the client, so translating it would add risk
// without adding value. Only what actually ends up in the generated ficha
// (título, descripción, and the literal categoria/estado enum values) needs
// to come out in the target market's language.
function buildPrompt(mercado: MercadoId, notas: string): string {
  const {
    nombre, idioma, categoriaOptions, estadoOptions, categoriaGeneroCounts,
    bilinguismoHint, condicionFrases, condicionEstadoIntro, ejemploAdicional,
  } = MERCADOS[mercado]
  const categoriaMujer  = categoriaOptions.slice(0, categoriaGeneroCounts.mujer).join(' · ')
  const categoriaHombre = categoriaOptions
    .slice(categoriaGeneroCounts.mujer, categoriaGeneroCounts.mujer + categoriaGeneroCounts.hombre)
    .join(' · ')
  const categoriaNinos  = categoriaOptions.slice(categoriaGeneroCounts.mujer + categoriaGeneroCounts.hombre).join(' · ')
  const [nuevoConEtiquetas, nuevoSinEtiquetas, muyBueno, bueno, satisfactorio] = estadoOptions

  const idiomaInstruccion = mercado === MERCADO_DEFAULT ? '' : `
IMPORTANTE — este anuncio es para Vinted ${nombre}: escribe TÍTULO y DESCRIPCIÓN íntegramente en ${idioma}, con vocabulario de moda natural y corriente en ese idioma (no una traducción literal palabra por palabra). Usa como referencia de estilo el ejemplo en ${idioma} más abajo. El resto de esta instrucción está en español y así se queda — incluido "_analisis", que es solo tu razonamiento interno y nunca se muestra al vendedor.
`

  const condicionEstado = `${condicionEstadoIntro} ${estadoOptions
    .map((label, i) => `"${label}" → ${condicionFrases[i]}`)
    .join(' · ')}`

  const ejemploMercado = ejemploAdicional

  return `Eres un experto en moda de segunda mano que vende en Vinted ${nombre}. Analiza las fotos y genera una ficha de venta optimizada para máxima visibilidad en búsquedas.

Regla de oro, por encima de todo lo demás: describe solo lo que ves en las fotos. Si algo no es visible o no estás seguro (composición del tejido, un defecto oculto, la talla exacta...), no lo inventes — dilo con un campo vacío o, si el campo es uno de los que admite duda, márcalo en campos_dudosos.
${idiomaInstruccion}${notas ? `\nEl vendedor añadió esta nota — tenla en cuenta si aporta información real sobre la prenda, pero las fotos mandan si hay contradicción: "${notas}"\n` : ''}
PASO 1 — Anota en "_analisis" (máx. 80 palabras, siempre en español) todo lo que observas:
· Tipo exacto de prenda + género estimado + color(es) específicos (azul marino, burdeos, crema, gris marengo, verde oliva, mostaza, camel, salmón, ocre, tostado, negro carbón, blanco roto...)
· Material/tejido (felpa, punto, vaquero/denim, lino, satén, cuero, ante, plumón, técnico/mesh, canalé, piqué...)
· Texto exacto de la etiqueta si visible: marca, talla, composición
· Características de diseño: logo (tipo, posición, colores), bolsillos, capucha, cremalleras, cordones, ribetes, bordados, estampados, etiquetas interiores, forro, interior
· Defectos: pilling, manchas, descosidos, desgaste en codos/dobladillos/cuello
· Polo o camiseta de corte deportivo (cuello polo o redondo, ribetes contrastados, tejido técnico/punto) con un nombre grande estampado que NO es una marca de ropa (una consola, una bebida, una aerolínea, un equipo, una universidad, un grupo musical...): sospecha que es una camiseta de club/equipo/patrocinio retro o merchandising de gira, aunque no distingas bien un escudo — el corte deportivo es la pista principal, el escudo (si se ve) solo lo confirma. Descríbela por lo que realmente es (equipación retro, tour tee...) y trata ese nombre como un dato de época/procedencia, nunca como si la prenda fuera temática de esa marca ajena.
· Si es CALZADO o un bolso/accesorio en vez de una prenda de vestir: fíjate en desgaste de suela/plantilla o en herrajes/asas/forro interior según el tipo, en vez de aplicar los criterios de prenda anteriores literalmente.

PASO 2 — Usa tu _analisis para rellenar cada campo:

TÍTULO — máx 80 caracteres, keyword-rich para búsquedas Vinted:
Orden: [tipo] [marca] [color/print] [características clave] [estilo si aplica] talla [talla]
Si no ves la talla, omite el segmento "talla [talla]" entero — nunca escribas "talla (a completar)" ni dejes el hueco vacío, ese placeholder es solo para la línea "Talla:" de la descripción.
${bilinguismoHint}
· Estilos si aplica: streetwear · sport · casual · formal · retro · outdoor
· "Sudadera hoodie Puma logo gráfico azul negra capucha cordón streetwear talla L"
· "Vaqueros jeans Levi's 501 azul oscuro slim fit desgastado talla 32"
· "Zapatillas sneakers Nike Air Max blancas grises running talla 42"
· "Camiseta fútbol retro Sevilla vintage patrocinador Super Nintendo años 90 talla M"
Sin puntos suspensivos ni emojis en el título

DESCRIPCIÓN — escríbela como la escribiría una persona real vendiendo su ropa, no como una plantilla. Nada de emojis, nada de iconos ni de etiquetas tipo "Detalles:" delante de cada bloque, nada de listas con viñetas. Evita también muletillas de anuncio genérico como "ideal para", "perfecto para combinar con cualquier look/outfit", "versátil", "atemporal" o "no dudarás en": son frases de plantilla, no de un vendedor real. Los saltos de línea son \\n en el JSON:

Primera línea: 1-2 frases naturales presentando la prenda (tipo, marca si hay, color y el rasgo que más destaque). No la escribas como ficha técnica ("Tipo – Marca – rasgo"), escríbela como una frase corriente.
[línea vacía]
2-4 frases cortas y sueltas mencionando 3-6 detalles observables (bolsillos, cierres, tejido, estampado...), con tono natural, como si se lo contaras a alguien.
[línea vacía]
Estado: [estado en minúscula], [condición en 4-6 palabras]
Talla: [talla o "(a completar)" si no visible]
Medidas en plano: (a completar)
[línea vacía]
Cierre de 1 frase, natural y variado, sobre envío o disponibilidad para preguntas. Varía también cómo empieza la frase, no solo el final: "Envío en 24-48h", "Lo mando rápido", "Cualquier duda, pregunta" y similares son puntos de partida distintos, no una fórmula fija que repetir en cada ficha.

${condicionEstado}

PRECIO — entero o .5, sin €. Base Vinted España, precios de segunda mano habituales:
Sin marca → camiseta 2-4 · sudadera 4-8 · pantalón 3-9 · vestido 4-11 · abrigo 7-16 · zapatos 4-10 · bolso 4-12 · accesorio (gorra, cinturón, bufanda, joyería de fantasía) 2-6
Fast-fashion (Zara, H&M, Mango, Bershka, Stradivarius, Pull&Bear, Springfield, Lefties) → ×1.5
Premium (Nike, Adidas, Levi's, Tommy Hilfiger, Calvin Klein, Lacoste, Guess, New Balance, Timberland) → ×2-3
Lujo (Gucci, Loewe, Prada, Burberry, Versace, Balenciaga, Max Mara, Boss, Massimo Dutti, Hackett) → ×8-30
Modificadores: "${nuevoConEtiquetas}" +40% · "${bueno}" −15% · "${satisfactorio}" −35%
Prenda fuera de temporada (abrigo en verano, bañador en invierno) → −15% adicional
Camiseta/equipación retro o de club (ver PASO 1) → 15-40 base, no la trates como una camiseta básica sin marca: el club, la época y el patrocinador son justo lo que le da valor de coleccionista
Ropa de Niños → 30-40% del precio equivalente de adulto de arriba (mismas categorías/marcas), salvo que sea una prenda de coleccionista como las de la línea de arriba

ESTADO — solo lo que ves en las fotos:
"${nuevoConEtiquetas}" — etiqueta original intacta y visible
"${nuevoSinEtiquetas}" — sin uso, sin defectos, sin etiqueta
"${muyBueno}" — 1-2 usos, sin pilling, sin manchas, sin desgaste perceptible
"${bueno}" — uso regular, sin pilling ni manchas, desgaste muy leve en costuras o cierres
"${satisfactorio}" — pilling apreciable, manchas, descosidos o desgaste notorio

CATEGORÍA — determina primero si es infantil, y elige exactamente una:
· NIÑOS: talla claramente infantil (etiqueta en cm o años, o tamaño evidente en la foto aunque no se vea etiqueta), corte y proporciones de niño pequeño — si hay cualquier indicio de esto, elige Niños antes de mirar las heurísticas de género de abajo.
· MUJER (solo si no es infantil): escote pronunciado, silueta entallada, cut-out, encaje, vestidos, faldas, lencería, print floral/femenino
· HOMBRE (solo si no es infantil): corte recto o amplio sin pinzas, cuello mao, camisas de vestir, ropa táctica o de trabajo
· DUDOSO entre Mujer/Hombre → si es amplia/oversize → Hombre; si es ceñida → Mujer; última opción: Hombre

Mujer: ${categoriaMujer}
Hombre: ${categoriaHombre}
Niños: ${categoriaNinos}

MARCA — nombre exacto de etiqueta o logo. Vacío si no visible.
TALLA — tal como en etiqueta, convertida siempre a talla europea/EU (Vinted ${nombre} la espera así) salvo en ropa de Niños, ver más abajo. Si la etiqueta ya muestra "EU" o un número de ropa normal (XS-XXXL, 34-48), úsalo tal cual.
Si es CALZADO y la etiqueta muestra varios sistemas a la vez (ej. "US 9 / UK 8 / EU 42.5"), coge siempre el valor EU.
Si es CALZADO y solo ves US o UK (sin EU visible), conviértelo a EU con esta tabla aproximada (hombre; para mujer resta a la talla EU resultante aprox. 1.5) y añade "talla" a campos_dudosos porque es una conversión, no una lectura directa:
US 6→EU 39 · US 6.5→EU 39.5 · US 7→EU 40 · US 7.5→EU 40.5 · US 8→EU 41 · US 8.5→EU 42 · US 9→EU 42.5 · US 9.5→EU 43 · US 10→EU 44 · US 10.5→EU 44.5 · US 11→EU 45 · US 12→EU 46 · US 13→EU 47
Si la CATEGORÍA es de Niños, la talla de la etiqueta no sigue el formato de adulto — suele venir en altura (cm) y/o edad ("104", "4-5 años", "4-5A"): escríbela tal como aparece (ej. "104 cm" o "4 años"), sin forzarla al formato EU de adulto.
PRIORIDAD: etiqueta > estimación visual. Incertidumbre → vacío. Nunca inventes.

CAMPOS_DUDOSOS — array con los nombres exactos ("marca", "talla", "categoria", "estado") de los campos que son una estimación poco fiable: talla calculada a ojo sin etiqueta visible, marca deducida de un logo parcial o no confirmada, categoría dudosa por corte ambiguo, estado difícil de valorar por fotos poco claras. Vacío si tienes confianza razonable en todos. No incluyas un campo solo por rellenar el array.

ALERTA — string vacía salvo que veas uno de estos dos casos, en cuyo caso responde EXACTAMENTE ese código (nunca una frase propia, el texto que se muestra lo pone la app):
· "ropa_interior_usada" — ropa interior o bañador con aspecto de uso (sin etiquetas ni aspecto de "nuevo"), que Vinted solo permite vender nuevas y con etiqueta.
· "posible_replica" — sospecha razonable de réplica o falsificación de una marca de lujo (logo, tipografía o acabado que no coincide con el original).
No marques nada por precaución si no hay un indicio claro — evita falsos positivos, la mayoría de fichas no deberían llevar alerta.

EJEMPLO 1 (streetwear con marca y etiqueta visible):
{"_analisis":"Nike logo bordado en pecho. Felpa negra con capucha. Etiqueta: Nike, M. Bolsillo canguro. Cordón negro. Ribetes canalé en puños y bajo. Interior afelpado. Sin pilling ni manchas.","titulo":"Sudadera hoodie Nike logo bordado negra capucha cordón sport streetwear talla M","descripcion":"Sudadera Nike con capucha en negro, con el logo bordado en el pecho y capucha con cordón ajustable.\\n\\nTiene bolsillo canguro delantero y el interior es de felpa suave, muy calentita. Puños y bajo con ribete canalé.\\n\\nEstado: muy bueno, sin manchas ni desperfectos\\nTalla: M\\nMedidas en plano: (a completar)\\n\\nSi tienes dudas pregunta sin problema, lo envío en 24-48h.","precio":20,"categoria":"Jerseys y sudaderas hombre","estado":"Muy bueno","marca":"Nike","talla":"M","campos_dudosos":[],"alerta":""}

EJEMPLO 2 (vestido sin marca ni etiqueta visible — nótese que "talla" lleva una estimación Y aparece en campos_dudosos a la vez):
{"_analisis":"Vestido midi verde oliva, tirantes finos, escote cruzado. Tejido satinado fluido, cae bien. Sin etiqueta visible. Cremallera lateral oculta. Sin manchas ni enganches.","titulo":"Vestido midi verde oliva satinado tirantes escote cruzado talla M","descripcion":"Vestido midi verde oliva con tirantes finos y escote cruzado que estiliza mucho. El tejido es satinado y cae genial, sin arrugas raras.\\n\\nCierre de cremallera oculta en el lateral. Se puede llevar tanto para una cena o un evento como en plan más casual con una chaqueta encima.\\n\\nEstado: nuevo sin etiquetas, sin uso aparente\\nTalla: M\\nMedidas en plano: (a completar)\\n\\nEnvío en 24-48h, escríbeme si tienes dudas.","precio":9,"categoria":"Vestidos","estado":"Nuevo sin etiquetas","marca":"","talla":"M","campos_dudosos":["talla"],"alerta":""}${ejemploMercado}

Responde SOLO con JSON válido: {"_analisis":"","titulo":"","descripcion":"","precio":0,"categoria":"","estado":"","marca":"","talla":"","campos_dudosos":[],"alerta":""}`
}

export async function POST(request: Request): Promise<Response> {
  // ── Rate limit ───────────────────────────────────────────────────────────────
  const { limited, retryAfter } = await checkRateLimit(getClientIP(request))
  if (limited) return rateLimitResponse(retryAfter)

  if (!openai) {
    return Response.json(
      { error: 'Servicio no disponible temporalmente.' },
      { status: 503 }
    )
  }

  // ── Payload size (Content-Length header, required) ───────────────────────────
  const clError = checkContentLength(request, MAX_BODY_BYTES)
  if (clError) return clError

  // ── Parse & validate body ────────────────────────────────────────────────────
  let fotos: Record<string, unknown>
  let notas: string
  let mercado: MercadoId
  try {
    const body = await request.json()
    fotos = body?.fotos
    // Free-text, so treat as untrusted: cap length and collapse newlines —
    // it's interpolated straight into the prompt below. The strict JSON
    // schema is the real backstop against prompt injection either way.
    notas = typeof body?.notas === 'string' ? body.notas.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    // Unknown/missing mercado falls back to ES rather than rejecting the
    // request — keeps older clients (and the mocked test suite) working.
    mercado = isMercadoId(body?.mercado) ? body.mercado : MERCADO_DEFAULT
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
  for (const key of ['etiqueta', 'trasera', 'detalle'] as const) {
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
    .filter((i): i is { foto: FotoPayload; descripcion: string } => validateFoto(i.foto))
    .map(i => ({
      type: 'image_url' as const,
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
              categoria:   { type: 'string', enum: MERCADOS[mercado].categoriaOptions },
              estado:      { type: 'string', enum: MERCADOS[mercado].estadoOptions },
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
              text: buildPrompt(mercado, notas),
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
    // Zod is the declared, single source of truth for what happens next:
    // reject the whole response if titulo/descripcion/precio are unusable,
    // fall back field-by-field to safe defaults for everything else.
    let raw: unknown
    try {
      raw = JSON.parse(content)
    } catch {
      return Response.json(
        { error: 'Error procesando la respuesta de la IA. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    const parsed = fichaResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { error: 'La IA devolvió una respuesta incompleta. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    const { campos_dudosos: camposDudosos, ...rest } = parsed.data
    // Carries the mercado through to the client so it can render the right
    // ESTADO/CATEGORÍA options when the ficha is later edited or reopened
    // from historial — categoria/estado are already the target market's
    // literal enum values, this just labels which market they belong to.
    const safeFicha = { ...rest, camposDudosos, mercado }

    return Response.json(safeFicha, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: unknown) {
    const status = err instanceof OpenAI.APIError && err.status === 429 ? 429 :
                   err instanceof OpenAI.APIError && err.status === 401 ? 401 : 500
    const message =
      status === 429 ? 'Demasiadas peticiones. Espera un momento.' :
      status === 401 ? 'Clave de API inválida. Contacta con soporte.' :
      'Error al analizar la prenda. Inténtalo de nuevo.'

    // Only surface unexpected errors to Sentry. 429/401 are upstream signals
    // that we already handle by design — they'd just be noise.
    if (status === 500) {
      Sentry.captureException(err, { tags: { route: 'api/analyze' } })
    }

    return Response.json({ error: message }, { status })
  }
}
