// Client-only persistence for the historial (localStorage + best-effort sync
// push). Kept separate from historial.ts, which is shared with the server
// and must stay free of browser-only globals like localStorage.
import { sanitizeHistorial, MAX_HISTORIAL, type HistorialItem } from './historial'
import { SYNC_CODE_KEY, pushSync } from './syncClient'

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
      syncPushTimer = setTimeout(() => {
        pushSync(code, items).catch(() => {})
      }, SYNC_PUSH_DEBOUNCE_MS)
    }
    return true
  } catch {
    return false
  }
}
