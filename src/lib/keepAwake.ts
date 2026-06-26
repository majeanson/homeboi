import { useSyncExternalStore } from 'react'

// Per-device opt-out for the Screen Wake Lock the hub shell holds (HubLayout) so a
// wall tablet doesn't dim/sleep while the board is showing. Default ON — the primary
// device is a kiosk that should stay lit. On a phone you'd turn it OFF to save battery
// (the hint in Réglages ▸ Affichage says so). localStorage-backed + read live via
// useSyncExternalStore (same spirit as lib/apod), so toggling it engages/releases the
// lock on this device immediately, no reload. The cook surfaces hold their own lock
// unconditionally (you're actively cooking) — this setting only governs the shell.
const KEY = 'babillard-keep-awake'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0' // unset / anything-but-"0" = ON
  } catch {
    return true
  }
}

export function setKeepAwake(on: boolean): void {
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

export function useKeepAwake(): boolean {
  return useSyncExternalStore(subscribe, read, () => true)
}
