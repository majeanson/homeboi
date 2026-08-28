// Idle-mode debug controls (Réglages ▸ Debug). The shared-kiosk "drift back to
// Maisonnée" idle reset (HubLayout) only fires on a KIOSK with a profile picked,
// after 3 idle minutes — impossible to eyeball while developing. These helpers let
// the Debug tab (a) shrink the idle window to seconds and (b) force the warning
// chip or the drift on demand, by talking to HubLayout's idle effect through a
// localStorage override + a window CustomEvent. Dev tooling only — NOT a household
// setting, never synced server-side; it clears with the browser.

const SPEED_KEY = 'bb.debug.idleMs' // overrides the 3-min idle window; absent = normal

export type IdleSpeed = 'normal' | '30s' | '10s' | '5s'

// null ⇒ use HubLayout's real 3-minute window.
export const IDLE_SPEED_MS: Record<IdleSpeed, number | null> = {
  normal: null,
  '30s': 30_000,
  '10s': 10_000,
  '5s': 5_000,
}

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

// NOTE (2026-08-27): the SPEED half of this module has no UI and never had one.
// `currentIdleSpeed`/`setIdleSpeed` were removed as dead exports when knip became a
// real gate — nothing ever called them, so `SPEED_KEY` is a key nothing writes and
// `idleOverrideMs()` below therefore always reads null today. It is kept because
// HubLayout still consults it, and because writing that key by hand in devtools is a
// genuinely useful way to watch the idle cycle without waiting three minutes.
// What DOES ship is the force half: « Aperçu » in Réglages ▸ Affichage ▸ Mode veille
// calls `forceIdle('screensaver')`.

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
