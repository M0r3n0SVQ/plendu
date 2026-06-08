import OpenAI from 'openai'

// Vercel: pin to Node runtime (OpenAI SDK + large bodies),
// allow up to 60s for vision inference, force per-request execution.
export const runtime  = 'nodejs'
export const maxDuration = 60
export const dynamic  = 'force-dynamic'

// Guard: fail fast at cold-start if key is missing
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS  = 60_000  // 1 minute window
const RATE_LIMIT_MAX        = 10      // max requests per IP per window

function getClientIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isRateLimited(ip) {
  const now = Date.now()

  // Prevent unbounded map growth under heavy load
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

// ─── Validation constants ─────────────────────────────────────────────────────
const ALLOWED_MIMES  = new Set(['image/jpeg', 'image/png', 'image/webp'])
// 7 MB of base64 chars ≈ 5.25 MB of binary (base64 = 4/3 overhead)
const MAX_BASE64_LEN = 7 * 1024 * 1024
const MAX_BODY_BYTES = 30 * 1024 * 1024  // 30 MB hard cap for 4 images combined

// Validate base64 format and size
function isValidBase64(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > MAX_BASE64_LEN) {
    return false
  }
  // Accept only base64 alphabet + padding
  return /^[A-Za-z0-9+/]+=*$/.test(str)  // ={0,2} would be stricter but =* is safe here
}

// Validate a single foto payload
function validateFoto(foto) {
  if (!foto || typeof foto !== 'object') return false
  if (!ALLOWED_MIMES.has(foto.mime))     return false
  if (!isValidBase64(foto.data))          return false
  return true
}

export async function POST(request) {
  // ── Rate limit ───────────────────────────────────────────────────────────────
  if (isRateLimited(getClientIP(request))) {
    return Response.json(
      { error: 'Demasiadas peticiones. Espera un momento.' },
      { status: 429, headers: { 'Retry-After': '60' } }
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
  let fotos
  try {
    const body = await request.json()
    fotos = body?.fotos
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
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Eres un experto en moda de segunda mano que vende en Vinted España. Analiza las fotos y genera una ficha de venta optimizada para máxima visibilidad en búsquedas.

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

DESCRIPCIÓN — formato estructurado emoji (los saltos de línea son \\n en el JSON):
🧵 [Tipo español] [Tipo inglés] [Marca] – [rasgo 1] – [rasgo 2]
[línea vacía]
🟢/🟡/🟠 Estado: [estado], [condición en 4-6 palabras]
✏️ Talla: [talla o "(a completar)" si no visible]
🌟 Detalles:
[línea vacía]
[ítem observable 1]
[ítem observable 2]
... (4-9 ítems, uno por línea, solo lo que ves en las fotos)
📏 Medidas en plano: (a completar)
📦 Envío rápido 24-48h
🎯 Precio ajustado. Pregunta sin compromiso

Emojis de estado: 🟢 = Nuevo con etiquetas / Nuevo sin etiquetas / Muy bueno · 🟡 = Bueno · 🟠 = Satisfactorio
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
TALLA — tal como en etiqueta. Vacío si no visible.
PRIORIDAD: etiqueta > estimación visual. Incertidumbre → vacío. Nunca inventes.

EJEMPLO DE SALIDA:
{"_analisis":"Nike logo bordado en pecho. Felpa negra con capucha. Etiqueta: Nike, M. Bolsillo canguro. Cordón negro. Ribetes canalé en puños y bajo. Interior afelpado. Sin pilling ni manchas.","titulo":"Sudadera hoodie Nike logo bordado negra capucha cordón sport streetwear talla M","descripcion":"🧵 Sudadera hoodie Nike – Capucha – Logo bordado\\n\\n🟢 Estado: Muy bueno, sin manchas ni desperfectos\\n✏️ Talla: M\\n🌟 Detalles:\\n\\nLogo Nike bordado en el pecho en blanco\\nCapucha con cordón ajustable negro\\nBolsillo canguro frontal\\nInterior de felpa suave\\nPuños y bajo canalé\\nColor negro\\n📏 Medidas en plano: (a completar)\\n📦 Envío rápido 24-48h\\n🎯 Precio ajustado. Pregunta sin compromiso","precio":20,"categoria":"Jerseys y sudaderas hombre","estado":"Muy bueno","marca":"Nike","talla":"M"}

Responde SOLO con JSON válido: {"_analisis":"","titulo":"","descripcion":"","precio":0,"categoria":"","estado":"","marca":"","talla":""}`,
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

    // json_object mode guarantees valid JSON — no fence cleanup needed
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
    return Response.json({ error: message }, { status })
  }
}
