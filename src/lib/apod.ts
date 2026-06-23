import { useSyncExternalStore } from 'react'

// Per-device opt-out for the board's "Photo du jour" (NASA APOD) band — a little
// daily wonder on the wall. Default ON. localStorage-backed (same spirit as the
// day-part-auto flag in lib/theme and the ambient settings in lib/ambient — a
// device-local display preference, not household data, so no server round-trip),
// read live via useSyncExternalStore so toggling it in Réglages ▸ Affichage shows
// or hides the band on this device without a reload.
const KEY = 'babillard-apod'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0' // unset / anything-but-"0" = ON
  } catch {
    return true
  }
}

export function setApodEnabled(on: boolean): void {
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

export function useApodEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true)
}
