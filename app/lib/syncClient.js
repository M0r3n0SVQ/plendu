// Client-only fetch wrappers for /api/sync — kept separate from SyncModal.js
// (the UI) so ImageUploader.js can push on every save without importing a
// component file for what's really a data-layer concern.

export const SYNC_CODE_KEY = 'plendu_sync_code'

// Excludes 0/O/1/I/L to avoid mixing up characters when copying by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateSyncCode() {
  const random = new Uint32Array(12)
  crypto.getRandomValues(random)
  const raw = [...random].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

export async function pushSync(code, historial) {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, historial }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo activar la sincronización.')
  return data
}

export async function pullSync(code) {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo leer ese código.')
  // A 200 with an empty historial is ambiguous by itself — could be a typo'd
  // code that was never used. `found` disambiguates so a mistyped code
  // surfaces as an error instead of a silent, empty "success".
  if (!data.found) throw new Error('Ese código no existe o ha caducado.')
  return data.historial || []
}

export async function deleteSync(code) {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, { method: 'DELETE' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo eliminar la sincronización.')
  return data
}
