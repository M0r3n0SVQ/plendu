import { DUDOSO_FIELDS } from './vintedOptions'

// Shared between the client (validating localStorage on load — it's still
// "untrusted" input, a user or extension could have edited it directly) and
// the server (validating a sync payload, which must never be trusted just
// because it looks like a real ficha). One definition means the two can't
// silently drift on what counts as a valid entry.

const FICHA_FIELD_MAX_LEN = 1000
export const MEDIDAS_MAX_LEN = 100
export const MAX_HISTORIAL = 10

export function sanitizeFicha(raw) {
  if (!raw || typeof raw !== 'object') return null
  const safe = {}
  for (const f of ['titulo', 'descripcion', 'estado', 'categoria', 'marca', 'talla', 'alerta']) {
    if (typeof raw[f] === 'string') safe[f] = raw[f].slice(0, FICHA_FIELD_MAX_LEN)
  }
  if (typeof raw.medidas === 'string') safe.medidas = raw.medidas.slice(0, MEDIDAS_MAX_LEN)
  if (typeof raw.precio === 'number' && isFinite(raw.precio)) safe.precio = raw.precio
  safe.camposDudosos = Array.isArray(raw.camposDudosos)
    ? raw.camposDudosos.filter(f => DUDOSO_FIELDS.includes(f))
    : []
  return safe
}

export function sanitizeHistorialItem(raw) {
  if (!raw || typeof raw !== 'object') return null
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

export function sanitizeHistorial(raw, maxItems = MAX_HISTORIAL) {
  if (!Array.isArray(raw)) return []
  return raw.map(sanitizeHistorialItem).filter(Boolean).slice(0, maxItems)
}

// Union by id — on a shared id, keeps whichever side has the more recent
// updatedAt instead of just letting the second argument win — sorted
// newest-first, capped. Used when pulling a sync code merges with whatever's
// already local instead of silently discarding either side's edits.
export function mergeHistorial(a, b, maxItems = MAX_HISTORIAL) {
  const byId = new Map()
  for (const item of [...a, ...b]) {
    const existing = byId.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item)
  }
  return [...byId.values()].sort((x, y) => y.id - x.id).slice(0, maxItems)
}
