// Shared with app/api/analyze/route.ts (Structured Outputs schema) so the
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
// writing. Kept in Spanish regardless of mercado — it's the app's own UI
// chrome, not part of the generated listing content.
export const ALERTA_MESSAGES = {
  ropa_interior_usada: 'Esta prenda parece ropa interior o bañador con uso. Vinted solo permite vender este tipo de prendas nuevas y con etiqueta — revisa sus normas antes de publicar.',
  posible_replica: 'El logo, la tipografía o el acabado no terminan de coincidir con el original. Antes de publicarla como una prenda de marca, confirma que no sea una réplica.',
} as const
export type AlertaCode = keyof typeof ALERTA_MESSAGES

export function isAlertaCode(value: unknown): value is AlertaCode {
  return typeof value === 'string' && Object.hasOwn(ALERTA_MESSAGES, value)
}

// ─── Vinted España ────────────────────────────────────────────────────────
const ESTADO_OPTIONS_ES = [
  'Nuevo con etiquetas',
  'Nuevo sin etiquetas',
  'Muy bueno',
  'Bueno',
  'Satisfactorio',
] as const

const CATEGORIA_OPTIONS_ES = [
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

// ─── Vinted France ────────────────────────────────────────────────────────
// Mismos 5 niveles que en España — Vinted usa la misma escala de estado en
// todos sus mercados, solo cambia el idioma de la etiqueta.
const ESTADO_OPTIONS_FR = [
  'Neuf avec étiquette',
  'Neuf sans étiquette',
  'Très bon état',
  'Bon état',
  'Satisfaisant',
] as const

// Misma estructura que CATEGORIA_OPTIONS_ES (mismo orden, mismo número de
// categorías) para que MERCADOS[x].categoriaOptions[i] sea siempre "la misma
// categoría" en ambos idiomas — evita que se desincronicen con el tiempo.
const CATEGORIA_OPTIONS_FR = [
  // Femme
  'Tops et t-shirts', 'Chemises et blouses', 'Pulls et sweats', 'Robes',
  'Jupes', 'Pantalons', 'Jeans', 'Vestes et manteaux', 'Vêtements de sport',
  'Sous-vêtements', 'Maillots de bain', 'Tailleurs et ensembles', 'Chaussures femme',
  'Sacs', 'Accessoires femme',
  // Homme
  'T-shirts', 'Chemises', 'Pulls et sweats homme', 'Pantalons homme',
  'Jeans homme', 'Vestes et manteaux homme', 'Vêtements de sport homme',
  'Chaussures homme', 'Accessoires homme',
  // Enfants
  'Vêtements fille', 'Vêtements garçon', 'Chaussures enfants', 'Accessoires enfants',
] as const

interface Mercado {
  id: 'ES' | 'FR'
  nombre: string   // para el selector de la interfaz, en español
  idioma: string    // nombre del idioma en español, para instruir a la IA
  estadoOptions: readonly string[]
  categoriaOptions: readonly string[]
  // How many of categoriaOptions' leading entries are Mujer/Hombre/Niños,
  // in that order. Must sum to categoriaOptions.length (checked below) —
  // lets buildPrompt (app/api/analyze/route.ts) split the flat list back
  // into its three gender groups without hardcoding the boundary indices.
  categoriaGeneroCounts: { mujer: number; hombre: number; ninos: number }
  // AI-prompt-only content below (never shown to the user, doesn't need
  // translating in the "faithful" sense — just needs to make sense in the
  // target market). Kept here as data, one entry per mercado, instead of as
  // `mercado === 'FR'` checks inside buildPrompt, so adding a market is
  // purely a data change there too.
  bilinguismoHint: string
  // One phrase per estadoOptions entry, same order — each already carries
  // its own quoting/brackets exactly as it should appear in the prompt (the
  // last tier is an instruction placeholder, not a literal phrase, so it's
  // deliberately unquoted).
  condicionFrases: readonly [string, string, string, string, string]
  condicionEstadoIntro: string
  // Extra worked example appended to the prompt for non-default markets,
  // demonstrating título/descripción in the target language. Empty for the
  // default market, which doesn't need one (examples 1-2 already cover it).
  ejemploAdicional: string
}

export const MERCADOS: Record<'ES' | 'FR', Mercado> = {
  ES: {
    id: 'ES', nombre: 'España', idioma: 'español',
    estadoOptions: ESTADO_OPTIONS_ES, categoriaOptions: CATEGORIA_OPTIONS_ES,
    categoriaGeneroCounts: { mujer: 15, hombre: 9, ninos: 4 },
    bilinguismoHint: '· Bilingüismo útil: sudadera/hoodie · zapatillas/sneakers · vaqueros/jeans · camiseta/tshirt · abrigo/coat · chaqueta/jacket',
    condicionFrases: [
      '"con etiqueta original"',
      '"sin uso aparente"',
      '"sin manchas ni desperfectos"',
      '"desgaste muy leve, sin manchas"',
      '[describe el defecto principal]',
    ],
    condicionEstadoIntro: 'Condición de estado:',
    ejemploAdicional: '',
  },
  FR: {
    id: 'FR', nombre: 'Francia', idioma: 'francés',
    estadoOptions: ESTADO_OPTIONS_FR, categoriaOptions: CATEGORIA_OPTIONS_FR,
    categoriaGeneroCounts: { mujer: 15, hombre: 9, ninos: 4 },
    bilinguismoHint: '· Bilingüismo útil (francés/inglés): pull/sweat · basket/sneakers · jean/denim · manteau/coat · veste/jacket',
    condicionFrases: [
      '"avec étiquette d\'origine"',
      '"jamais porté"',
      '"sans tache ni défaut"',
      '"légère usure, sans tache"',
      '[décris le défaut principal en français]',
    ],
    condicionEstadoIntro: 'Condition (état), a incluir en la descripción EN FRANCÉS:',
    ejemploAdicional: `

EJEMPLO 3 (mercado Francia: título y descripción en francés; categoría, estado y el resto de la ficha igual que en los otros ejemplos):
{"_analisis":"Pull Zara col rond gris chiné. Tricot fin, coupe droite. Étiquette visible: Zara, taille M. Sans défaut apparent.","titulo":"Pull Zara sweater gris chiné col rond coupe droite taille M","descripcion":"Pull Zara gris chiné, coupe droite et col rond, agréable à porter au quotidien.\\n\\nTricot fin mais chaud, sans aucune bouloche ni tache visible.\\n\\nÉtat : très bon état, sans tache ni défaut\\nTaille : M\\nMesures à plat : (a completar)\\n\\nEnvoi rapide, n'hésitez pas à me contacter pour toute question.","precio":12,"categoria":"Pulls et sweats","estado":"Très bon état","marca":"Zara","talla":"M","campos_dudosos":[],"alerta":""}`,
  },
}
export type MercadoId = keyof typeof MERCADOS
export const MERCADO_IDS = Object.keys(MERCADOS) as MercadoId[]
export const MERCADO_DEFAULT: MercadoId = 'ES'

// The "same order, same count across mercados" invariant above is only ever
// stated as a comment — nothing previously caught it if a future edit to one
// market's list (add/remove/reorder a category) forgot to mirror the other,
// which would silently misalign categoriaOptions[i]/estadoOptions[i] between
// markets instead of failing anywhere obvious. Fail loudly at module load —
// same "fail fast on a programmer error, not on user input" reasoning as the
// OPENAI_API_KEY cold-start check in app/api/analyze/route.ts — instead of
// leaving that to be discovered from a wrong category showing up in
// production or, worse, silently baked into the AI prompt.
for (const id of MERCADO_IDS) {
  const m = MERCADOS[id]
  if (m.estadoOptions.length !== MERCADOS[MERCADO_DEFAULT].estadoOptions.length) {
    throw new Error(`vintedOptions: estadoOptions length mismatch for mercado "${id}"`)
  }
  if (m.categoriaOptions.length !== MERCADOS[MERCADO_DEFAULT].categoriaOptions.length) {
    throw new Error(`vintedOptions: categoriaOptions length mismatch for mercado "${id}"`)
  }
  const { mujer, hombre, ninos } = m.categoriaGeneroCounts
  if (mujer + hombre + ninos !== m.categoriaOptions.length) {
    throw new Error(`vintedOptions: categoriaGeneroCounts doesn't add up to categoriaOptions.length for mercado "${id}"`)
  }
  // condicionFrases is typed as a fixed 5-tuple, but estadoOptions is a
  // plain readonly string[] — TypeScript won't catch a future estado tier
  // added to estadoOptions without also growing condicionFrases, and
  // buildPrompt's estadoOptions.map((label, i) => condicionFrases[i]) would
  // silently bake "<estado>" → undefined into the AI prompt for the missing
  // index instead of erroring anywhere.
  if (m.condicionFrases.length !== m.estadoOptions.length) {
    throw new Error(`vintedOptions: condicionFrases length doesn't match estadoOptions for mercado "${id}"`)
  }
}

export function isMercadoId(value: unknown): value is MercadoId {
  return typeof value === 'string' && Object.hasOwn(MERCADOS, value)
}

// Resolves untrusted input to a valid MercadoId, defaulting to
// MERCADO_DEFAULT — the one place this fallback is spelled out, instead of
// each caller re-deriving `isMercadoId(x) ? x : MERCADO_DEFAULT` by hand.
export function resolveMercadoId(value: unknown): MercadoId {
  return isMercadoId(value) ? value : MERCADO_DEFAULT
}

// Suggested values for the talla <datalist> — not a closed enum like the
// others above, sellers can type anything the AI didn't already fill in.
// Same numeric/letter scale in France as in Spain (both use EU sizing),
// so this doesn't need a per-mercado variant.
export const TALLA_OPTIONS = [
  // Letter sizes
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  // Numeric clothing
  '34', '36', '38', '40', '42', '44', '46', '48',
  // Shoe sizes
  '35', '37', '39', '41', '43', '45', '47',
  // Jeans waist
  '28', '30', '32',
  // Kids
  '2 años', '4 años', '6 años', '8 años', '10 años', '12 años', '14 años',
] as const
