// Shared with app/api/analyze/route.js (Structured Outputs schema) so the
// AI can never return a category/estado value the client-side <select> and
// <datalist> don't recognize.

// Fields the AI can flag as an uncertain estimate (see "campos_dudosos" in
// the schema). Shared so the server's validation and the client's "ESTIMADO"
// badge can never drift apart on which field names are recognized.
export const DUDOSO_FIELDS = ['marca', 'talla', 'categoria', 'estado'] as const
export type DudosoField = (typeof DUDOSO_FIELDS)[number]

// Fixed, developer-authored warning copy for the "alerta" banner. The AI only
// ever returns one of these codes (never free text) — it renders with
// role="alert" styling that reads as an authoritative warning, and that text
// must never be something a crafted "notas" input could talk the model into
// writing.
export const ALERTA_MESSAGES = {
  ropa_interior_usada: 'Esta prenda parece ropa interior o bañador con uso. Vinted solo permite vender este tipo de prendas nuevas y con etiqueta — revisa sus normas antes de publicar.',
  posible_replica: 'El logo, la tipografía o el acabado no terminan de coincidir con el original. Antes de publicarla como una prenda de marca, confirma que no sea una réplica.',
} as const
export type AlertaCode = keyof typeof ALERTA_MESSAGES

export const ESTADO_OPTIONS = [
  'Nuevo con etiquetas',
  'Nuevo sin etiquetas',
  'Muy bueno',
  'Bueno',
  'Satisfactorio',
] as const
export type Estado = (typeof ESTADO_OPTIONS)[number]

export const CATEGORIA_OPTIONS = [
  // Mujer
  'Camisetas y tops', 'Camisas y blusas', 'Jerseys y sudaderas', 'Vestidos',
  'Faldas', 'Pantalones', 'Vaqueros', 'Chaquetas y abrigos', 'Ropa de deporte',
  'Ropa interior', 'Bañadores', 'Trajes y conjuntos', 'Calzado mujer',
  'Bolsos', 'Accesorios mujer',
  // Hombre
  'Camisetas', 'Camisas', 'Jerseys y sudaderas hombre', 'Pantalones hombre',
  'Vaqueros hombre', 'Chaquetas y abrigos hombre', 'Ropa de deporte hombre',
  'Calzado hombre', 'Accesorios hombre',
  // Niños
  'Ropa niña', 'Ropa niño', 'Calzado niños', 'Accesorios niños',
] as const
export type Categoria = (typeof CATEGORIA_OPTIONS)[number]
