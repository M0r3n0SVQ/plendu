// Client-only persistence for the historial (localStorage + best-effort sync
// push). Kept separate from historial.ts, which is shared with the server
// and must stay free of browser-only globals like localStorage.
import { sanitizeHistorial, MAX_HISTORIAL, type HistorialItem } from './historial'
import { SYNC_CODE_KEY, pushSync, pushSyncBeacon } from './syncClient'

const HISTORIAL_KEY = 'plendu_historial'

export function loadHistorial(): HistorialItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]')
    return sanitizeHistorial(raw, MAX_HISTORIAL)
  } catch {
    return []
  }
}

// Debounces the network push only — localStorage below still saves every
// call synchronously. Some callers (e.g. a medidas keystroke) invoke this on
// every change, which would otherwise fire one POST per keystroke.
let syncPushTimer: ReturnType<typeof setTimeout> | undefined
const SYNC_PUSH_DEBOUNCE_MS = 800

// Holds whatever's still waiting out the debounce, so it can be flushed via
// sendBeacon if the tab closes/backgrounds before the timer fires — a plain
// setTimeout callback never runs once the page starts unloading, silently
// dropping the last edit's sync push otherwise.
let pendingPush: { code: string; items: HistorialItem[] } | null = null

function flushPendingPush() {
  if (!pendingPush) return
  const { code, items } = pendingPush
  pendingPush = null
  clearTimeout(syncPushTimer)
  // Thumbnails (up to 200KB each, sanitizeHistorialItem's cap) dominate
  // payload size and are exactly what pushes a real historial over the
  // ~64KB limit both sendBeacon and fetch's keepalive flag share in
  // Chromium — the two mechanisms this flush relies on to survive tab
  // close/backgrounding. Drop them here so the fields that actually matter
  // (título, precio, estado...) have a real chance of getting through; the
  // next normal pushSync (next edit, or reopening the app) re-syncs the
  // full historial, thumbnails included.
  const lightweight = items.map(item => ({ ...item, thumbnail: null }))
  if (!pushSyncBeacon(code, lightweight)) pushSync(code, lightweight).catch(() => {})
}

if (typeof document !== 'undefined') {
  // 'visibilitychange' → 'hidden' is the reliable cross-platform signal for
  // "the user is leaving" (tab close, app switch, phone lock) — unlike
  // 'beforeunload'/'unload', it also fires on mobile backgrounding, which is
  // how most sessions on this app actually end.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPush()
  })
}

export function saveHistorial(items: HistorialItem[]): boolean {
  try {
    localStorage.setItem(HISTORIAL_KEY, JSON.stringify(items))
    // Every mutation goes through this one function, so pushing the sync
    // copy here (instead of at each call site) means no caller can forget
    // to keep the other device's copy up to date. Best-effort: the local
    // save already succeeded, so a sync failure here is silent.
    const code = localStorage.getItem(SYNC_CODE_KEY)
    if (code) {
      clearTimeout(syncPushTimer)
      pendingPush = { code, items }
      syncPushTimer = setTimeout(() => {
        pendingPush = null
        pushSync(code, items).catch(() => {})
      }, SYNC_PUSH_DEBOUNCE_MS)
    }
    return true
  } catch {
    return false
  }
}
