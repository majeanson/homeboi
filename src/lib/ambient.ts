import { createDeviceStore } from './createDeviceStore'

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
  showDrawings: boolean // #49: fold saved kids' drawings into the photo mosaic
  showNext: boolean // a quiet "next up" line (tonight's supper + today's next event)
  // F-47 (bmad/08): at the top of the hour the idle clock breathes once — a slow
  // 2 s scale, no sound, no badge. The house's heartbeat, the anti-notification.
  // Every surface (kiosk, mobile, cast); prefers-reduced-motion turns it off.
  hourlyBreath: boolean
  returnHome: boolean // drift the picked face back to Maisonnée when idle
  returnHomeMin: number // minutes idle before that drift
}

const AMBIENT_DEFAULTS: AmbientSettings = {
  screensaver: true,
  idleMin: 5,
  showClock: true,
  showDate: true,
  showPhotos: true,
  showDrawings: true,
  showNext: true,
  hourlyBreath: true,
  returnHome: true,
  returnHomeMin: 3,
}

// Keep the minute fields sane (1–60) so a bad value can't disable idle silently.
function clampMinutes(s: AmbientSettings): AmbientSettings {
  return {
    ...s,
    idleMin: Math.min(60, Math.max(1, Math.round(s.idleMin))),
    returnHomeMin: Math.min(60, Math.max(1, Math.round(s.returnHomeMin))),
  }
}

const store = createDeviceStore<AmbientSettings>('babillard-ambient', AMBIENT_DEFAULTS, {
  // Merge over defaults so a setting added later is never `undefined`, then clamp.
  read: (raw) =>
    raw == null ? AMBIENT_DEFAULTS : clampMinutes({ ...AMBIENT_DEFAULTS, ...(JSON.parse(raw) as Partial<AmbientSettings>) }),
})

export const useAmbient = store.use

// Partial update: merge over the current value, clamp, persist.
export function setAmbient(patch: Partial<AmbientSettings>): void {
  store.set(clampMinutes({ ...store.get(), ...patch }))
}
