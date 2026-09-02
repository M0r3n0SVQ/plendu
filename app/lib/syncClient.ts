// Client-only fetch wrappers for /api/sync — kept separate from SyncModal.js
// (the UI) so ImageUploader.js can push on every save without importing a
// component file for what's really a data-layer concern.

import type { HistorialItem } from './historial'

export const SYNC_CODE_KEY = 'plendu_sync_code'

// Excludes 0/O/1/I/L to avoid mixing up characters when copying by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateSyncCode(): string {
  const random = new Uint32Array(12)
  crypto.getRandomValues(random)
  const raw = [...random].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

interface SyncPushResponse {
  ok: true
  count: number
}

interface SyncPullResponse {
  historial?: HistorialItem[]
  found?: boolean
}

interface SyncDeleteResponse {
  ok: true
}

interface SyncErrorResponse {
  error?: string
}

export async function pushSync(code: string, historial: HistorialItem[]): Promise<SyncPushResponse> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, historial }),
    // keepalive lets this survive page unload/backgrounding instead of being
    // cancelled mid-flight — matters here because this is also the fallback
    // flushPendingPush uses when sendBeacon can't be used (unsupported) or
    // refuses an oversized payload (its ~64KB cap, easily hit by a full
    // 10-item historial with thumbnails, well under this endpoint's own
    // MAX_BODY_BYTES).
    keepalive: true,
  })
  const data: SyncPushResponse & SyncErrorResponse = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo activar la sincronización.')
  return data
}

// Fire-and-forget variant for the tab-closing/backgrounding case. Preferred
// over pushSync there because it doesn't need the page to stay alive long
// enough to read a response — but it shares the same ~64KB payload cap as
// fetch's keepalive flag, so for a large historial it can still return
// false and fall back to the (now keepalive) pushSync above.
export function pushSyncBeacon(code: string, historial: HistorialItem[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false
  const blob = new Blob([JSON.stringify({ code, historial })], { type: 'application/json' })
  return navigator.sendBeacon('/api/sync', blob)
}

export async function pullSync(code: string): Promise<HistorialItem[]> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`)
  const data: SyncPullResponse & SyncErrorResponse = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo leer ese código.')
  // A 200 with an empty historial is ambiguous by itself — could be a typo'd
  // code that was never used. `found` disambiguates so a mistyped code
  // surfaces as an error instead of a silent, empty "success".
  if (!data.found) throw new Error('Ese código no existe o ha caducado.')
  return data.historial || []
}

export async function deleteSync(code: string): Promise<SyncDeleteResponse> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, { method: 'DELETE' })
  const data: SyncDeleteResponse & SyncErrorResponse = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo eliminar la sincronización.')
  return data
}
