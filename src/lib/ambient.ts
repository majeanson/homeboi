import { useSyncExternalStore } from 'react'

// Ambient / idle settings — what the kiosk does when nobody's touched it for a
// while. Two calm behaviours, both opt-out-able and tunable here:
//   • the SCREENSAVER: fade to a full-screen clock + date + slow photo frame
//     (+ optional next-up event) after `idleMin` minutes; tap anything to wake.
//   • the RETURN-HOME drift: clear the picked face back to "Maisonnée" after
//     `returnHomeMin` minutes, so a shared wall tablet never stays "stuck" as one
//     person (with a heads-up chip 30 s before).
// localStorage-backed (no server yet — same spirit as lib/theme's day-part flag,
// see bmad/04 OD-1), read live via useSyncExternalStore so a settings change
// re-arms HubLayout's idle timers without a reload. Structural calm is untouched:
// nothing here adds points/streaks/notifications.
export interface AmbientSettings {
  screensaver: boolean // show the idle screensaver at all
  idleMin: number // minutes idle before the screensaver appears
  showClock: boolean
  showDate: boolean
  showPhotos: boolean // the slow PhotoFrame slideshow as the backdrop
  showNext: boolean // a quiet "next up" line (tonight's supper + today's next event)
  returnHome: boolean // drift the picked face back to Maisonnée when idle
  returnHomeMin: number // minutes idle before that drift
}

const AMBIENT_DEFAULTS: AmbientSettings = {
  screensaver: true,
  idleMin: 5,
  showClock: true,
  showDate: true,
  showPhotos: true,
  showNext: true,
  returnHome: true,
  returnHomeMin: 3,
}

const KEY = 'babillard-ambient'
const listeners = new Set<() => void>()
let cache: AmbientSettings | null = null

function read(): AmbientSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return AMBIENT_DEFAULTS
    // Merge over defaults so a setting added later is never `undefined`.
    return { ...AMBIENT_DEFAULTS, ...(JSON.parse(raw) as Partial<AmbientSettings>) }
  } catch {
    return AMBIENT_DEFAULTS
  }
}

function snapshot(): AmbientSettings {
  if (!cache) cache = read()
  return cache
}

export function setAmbient(patch: Partial<AmbientSettings>): void {
  const next = { ...snapshot(), ...patch }
  // Keep the minute fields sane (1–60) so a bad value can't disable idle silently.
  next.idleMin = Math.min(60, Math.max(1, Math.round(next.idleMin)))
  next.returnHomeMin = Math.min(60, Math.max(1, Math.round(next.returnHomeMin)))
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode — the change still holds for this session via the cache */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useAmbient(): AmbientSettings {
  return useSyncExternalStore(subscribe, snapshot, () => AMBIENT_DEFAULTS)
}
