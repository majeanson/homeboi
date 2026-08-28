// Idle-mode debug controls. The shared-kiosk "drift back to Maisonnée" idle reset
// (HubLayout) only fires after 3 idle minutes — impossible to eyeball while
// developing. Two ways to cheat, both talking to HubLayout's idle effect:
//
//   1. FORCE it — `forceIdle('warn' | 'drift' | 'screensaver')` fires a window
//      CustomEvent. This is the half with a real UI: « Aperçu » in Réglages ▸
//      Affichage ▸ Mode veille.
//   2. SHRINK the window — set `bb.debug.idleMs` in localStorage by hand
//      (devtools). HubLayout reads it through `idleOverrideMs()` on every re-arm.
//
// There is no settings panel for (2), and the typed speed table that anticipated
// one was removed on 2026-08-27 when knip became a real CI gate and found it dead
// — it had sat unused since the module was written. Setting the key by hand is the
// documented path now; CLAUDE.md's Idle/ambient row says the same.
//
// Dev tooling only — NOT a household setting, never synced server-side; it clears
// with the browser.

const SPEED_KEY = 'bb.debug.idleMs' // overrides the 3-min idle window; absent = normal

const EVT = 'bb:idle-debug'
export type IdleDebugKind = 'warn' | 'drift' | 'screensaver' | 'speed'

// HubLayout reads this each time it (re)arms the idle timer.
export function idleOverrideMs(): number | null {
  try {
    const raw = localStorage.getItem(SPEED_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}


// Force the warning chip, the immediate drift back to Maisonnée, or the
// screensaver, right now — no waiting for the timer.
export function forceIdle(kind: 'warn' | 'drift' | 'screensaver') {
  emit(kind)
}

function emit(kind: IdleDebugKind) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: kind }))
}

// HubLayout subscribes: re-arm on 'speed', force warn/drift on the others.
export function onIdleDebug(cb: (kind: IdleDebugKind) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<IdleDebugKind>).detail)
  window.addEventListener(EVT, handler)
  return () => window.removeEventListener(EVT, handler)
}
