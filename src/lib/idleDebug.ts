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

export function currentIdleSpeed(): IdleSpeed {
  const ms = idleOverrideMs()
  if (ms == null) return 'normal'
  return (Object.keys(IDLE_SPEED_MS) as IdleSpeed[]).find((k) => IDLE_SPEED_MS[k] === ms) ?? 'normal'
}

export function setIdleSpeed(speed: IdleSpeed) {
  const ms = IDLE_SPEED_MS[speed]
  try {
    if (ms == null) localStorage.removeItem(SPEED_KEY)
    else localStorage.setItem(SPEED_KEY, String(ms))
  } catch {
    /* private-mode storage failure — debug only, ignore */
  }
  emit('speed')
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
