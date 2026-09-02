import { DUDOSO_FIELDS, resolveMercadoId, isAlertaCode, type MercadoId, type AlertaCode } from './vintedOptions'

// Shared between the client (validating localStorage on load — it's still
// "untrusted" input, a user or extension could have edited it directly) and
// the server (validating a sync payload, which must never be trusted just
// because it looks like a real ficha). One definition means the two can't
// silently drift on what counts as a valid entry.

const FICHA_FIELD_MAX_LEN = 1000
export const MEDIDAS_MAX_LEN = 100
export const MAX_HISTORIAL = 10

const FICHA_STRING_FIELDS = ['titulo', 'descripcion', 'estado', 'categoria', 'marca', 'talla'] as const

export interface SafeFicha {
  titulo?: string
  descripcion?: string
  estado?: string
  categoria?: string
  marca?: string
  talla?: string
  // '' means "no alerta" — anything else is one of ALERTA_MESSAGES' own
  // fixed codes, never free text (see vintedOptions.ts's isAlertaCode).
  alerta: AlertaCode | ''
  medidas?: string
  precio?: number
  camposDudosos: string[]
  // Which Vinted market this ficha's estado/categoria values belong to —
  // defaults to ES for entries saved before P1 (multi-mercado) existed.
  mercado: MercadoId
}

export interface HistorialItem {
  id: number
  fecha: string
  ficha: SafeFicha
  thumbnail: string | null
  vendida: boolean
  precioVenta: number | null
  updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function sanitizeFicha(raw: unknown): SafeFicha | null {
  if (!isRecord(raw)) return null
  const safe: SafeFicha = { camposDudosos: [], mercado: resolveMercadoId(raw.mercado), alerta: '' }
  for (const f of FICHA_STRING_FIELDS) {
    if (typeof raw[f] === 'string') safe[f] = (raw[f] as string).slice(0, FICHA_FIELD_MAX_LEN)
  }
  if (typeof raw.medidas === 'string') safe.medidas = raw.medidas.slice(0, MEDIDAS_MAX_LEN)
  if (typeof raw.precio === 'number' && isFinite(raw.precio)) safe.precio = raw.precio
  if (isAlertaCode(raw.alerta)) safe.alerta = raw.alerta
  safe.camposDudosos = Array.isArray(raw.camposDudosos)
    ? raw.camposDudosos.filter((f): f is string => DUDOSO_FIELDS.includes(f))
    : []
  return safe
}

export function sanitizeHistorialItem(raw: unknown): HistorialItem | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'number')    return null
  if (typeof raw.fecha !== 'string') return null
  const ficha = sanitizeFicha(raw.ficha)
  if (!ficha) return null
  // Only allow base64 data URLs — reject blob: and any other scheme
  const thumbnail = (
    typeof raw.thumbnail === 'string' &&
    raw.thumbnail.startsWith('data:image/') &&
    raw.thumbnail.length < 200_000
  ) ? raw.thumbnail : null
  return {
    id:          raw.id,
    fecha:       raw.fecha.slice(0, 20),
    ficha,
    thumbnail,
    vendida:     raw.vendida === true,
    precioVenta: typeof raw.precioVenta === 'number' && isFinite(raw.precioVenta) ? raw.precioVenta : null,
    // Falls back to id (a Date.now() creation timestamp) for older entries
    // that predate this field, so merge conflicts still resolve sanely.
    updatedAt:   typeof raw.updatedAt === 'number' && isFinite(raw.updatedAt) ? raw.updatedAt : raw.id,
  }
}

export function sanitizeHistorial(raw: unknown, maxItems = MAX_HISTORIAL): HistorialItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(sanitizeHistorialItem)
    .filter((item): item is HistorialItem => item !== null)
    .slice(0, maxItems)
}

// Union by id — on a shared id, keeps whichever side has the more recent
// updatedAt instead of just letting the second argument win — sorted
// newest-first, capped. Used when pulling a sync code merges with whatever's
// already local instead of silently discarding either side's edits.
export function mergeHistorial(a: HistorialItem[], b: HistorialItem[], maxItems = MAX_HISTORIAL): HistorialItem[] {
  const byId = new Map<number, HistorialItem>()
  for (const item of [...a, ...b]) {
    const existing = byId.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item)
  }
  return [...byId.values()].sort((x, y) => y.id - x.id).slice(0, maxItems)
}
