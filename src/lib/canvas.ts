import { useSyncExternalStore } from 'react'

// Per-device opt-out for the board's ambient « living canvas » — a subtle backdrop that
// drifts with the season + weather + time of day (a faint seasonal wash, gentle snow in
// winter). Default ON. localStorage-backed device-local preference (same spirit as the
// apod band + day-part-auto flag — not household data), read live via useSyncExternalStore
// so toggling it in Réglages ▸ Affichage shows/hides it on this device without a reload.
const KEY = 'babillard-canvas'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0' // unset / anything-but-"0" = ON
  } catch {
    return true
  }
}

export function setCanvasEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* private mode — the change still holds for this session via subscribers */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useCanvasEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true)
}
