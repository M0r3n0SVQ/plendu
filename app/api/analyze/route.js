import OpenAI from 'openai'

// Guard: fail fast at cold-start if key is missing
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export async function POST(request) {
  if (!openai) {
    return Response.json(
      { error: 'Servicio no configurado. Falta OPENAI_API_KEY.' },
      { status: 500 }
    )
  }

  // Parse & validate body
  let fotos
  try {
    const body = await request.json()
    fotos = body?.fotos
  } catch {
    return Response.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  if (!fotos?.principal?.data) {
    return Response.json(
      { error: 'Se requiere al menos la foto principal.' },
      { status: 400 }
    )
  }

  // Build image content blocks, preserving original mime type
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
        url: `data:${i.foto.mime || 'image/jpeg'};base64,${i.foto.data}`,
      },
    }))

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Eres un experto en moda de segunda mano y vintage con años de experiencia vendiendo en Vinted España. Analiza esta prenda con ojo crítico y realista.

Instrucciones:
- Identifica la prenda: tipo, color, estampado, material si es visible, marca si se aprecia
- El título debe ser directo y searchable, como buscaría un comprador real en Vinted
- La descripción debe sonar humana, no robótica. Menciona detalles reales que se vean en las fotos
- El precio debe ser competitivo para Vinted España:
  * Camisetas básicas sin marca: 3-6€
  * Camisetas de marca (Nike, Adidas, etc): 6-15€
  * Sudaderas básicas: 5-10€
  * Sudaderas de marca: 10-20€
  * Chaquetas básicas: 8-18€
  * Chaquetas de marca o vintage: 15-40€
  * Pantalones básicos: 5-12€
  * Vaqueros de marca: 10-25€
- El estado debe ser honesto basándote en lo que ves en las fotos
- Si hay foto de etiqueta, extrae marca, talla y composición con precisión
- Si no puedes determinar algo con certeza, usa "aprox." o "posiblemente"

Devuelve SOLO un JSON sin texto adicional ni bloques de código:
{
  "titulo": "título para Vinted máximo 50 caracteres, sin emojis",
  "descripcion": "2-3 frases naturales describiendo la prenda, su estado visible y por qué vale la pena comprarla",
  "precio": número en euros sin símbolo,
  "categoria": "categoría exacta de Vinted España",
  "estado": "Nuevo con etiquetas | Nuevo sin etiquetas | Muy bueno | Bueno | Satisfactorio",
  "marca": "marca si es visible o Sin marca",
  "talla": "talla si es visible o No visible"
}`,
            },
            ...imagenes,
          ],
        },
      ],
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return Response.json(
        { error: 'La IA no devolvió respuesta. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim()

    let ficha
    try {
      ficha = JSON.parse(cleaned)
    } catch {
      return Response.json(
        { error: 'Error procesando la respuesta de la IA. Inténtalo de nuevo.' },
        { status: 502 }
      )
    }

    return Response.json(ficha)
  } catch (err) {
    const status = err.status === 429 ? 429 : err.status === 401 ? 401 : 500
    const message =
      err.status === 429 ? 'Demasiadas peticiones. Espera un momento.' :
      err.status === 401 ? 'Clave de API inválida. Contacta con soporte.' :
      'Error al analizar la prenda. Inténtalo de nuevo.'
    return Response.json({ error: message }, { status })
  }
}
