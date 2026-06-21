// Day/night toggle. theme-bootstrap.js sets the initial value before mount;
// this just flips + persists it. A wall tablet should dim at night.
export type Theme = 'day' | 'night'

// The manual toggle stays binary (day/night), but the AUTO ambient drift can park
// the `data-theme` attribute on two intermediate dim tiers during the dawn/dusk
// ramps — so nightfall steps day → twilight → deep-twilight → night instead of
// cutting cream→black in one jump (Marc's smoother-transition ask, 2026-06-20).
export type ThemeAttr = Theme | 'twilight' | 'deep-twilight'

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'night' ? 'night' : 'day'
}

export function setTheme(theme: Theme): void {
  applyThemeAttr(theme)
  try {
    localStorage.setItem('babillard-theme', theme)
  } catch {
    /* noop */
  }
}

// The operator's last MANUAL day/night choice (or the OS preference if none),
// kept in localStorage. Auto day/night (below) never writes this, so turning the
// ambient drift off restores exactly the theme the operator had picked by hand.
export function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem('babillard-theme')
    if (saved === 'day' || saved === 'night') return saved
  } catch {
    /* noop */
  }
  return typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'night'
    : 'day'
}

// Apply a theme tier to <html> WITHOUT persisting — used by auto day/night so the
// stored manual choice survives untouched (see getStoredTheme). Accepts the wider
// `ThemeAttr` so the drift can set the intermediate twilight tiers; the manual
// toggle only ever passes 'day'/'night'.
export function applyThemeAttr(theme: ThemeAttr): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function toggleTheme(): Theme {
  const next = getTheme() === 'day' ? 'night' : 'day'
  setTheme(next)
  return next
}

// --- Ambient day-part drift (feature #1) ----------------------------------
// A SECOND, orthogonal axis layered on top of day/night: the palette gently
// drifts dawn→morning→afternoon→dusk→night across the day. Driven off the
// `data-daypart` attribute on <html> (core.css rebinds a few tokens per part).
// Calm: slow CSS transitions, opt-out, reduced-motion-safe (handled in CSS).
// The opt-out flag 'babillard-daypart-auto' === '0' means OFF; theme-bootstrap.js
// reads the same key so a kiosk reboots without a flash. When OFF we set the
// 'manual' sentinel so no part block applies (the base day/night palette shows).
export type DayPart =
  | 'dawn'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'dusk'
  | 'twilight'
  | 'deep-twilight'
  | 'night'

export function isDaypartAuto(): boolean {
  try {
    return localStorage.getItem('babillard-daypart-auto') !== '0'
  } catch {
    return true
  }
}

export function setDayPart(part: DayPart | 'manual'): void {
  document.documentElement.setAttribute('data-daypart', part)
}

// Auto day/night: when the ambient drift is on it ALSO drives the day/night theme
// tier so the wall actually dims at night (not just a tinted cream). The dawn/dusk
// ramps step through two intermediate tiers so the change is gradual (Marc's
// smoother-transition ask, 2026-06-20): twilight/deep-twilight → their own dim
// palettes, night → full dark, everything else → day. Applied as an ATTRIBUTE ONLY
// (applyThemeAttr) so the manual choice is preserved and restored when ambient is
// switched off.
export function themeForPart(part: DayPart): ThemeAttr {
  if (part === 'night') return 'night'
  if (part === 'deep-twilight') return 'deep-twilight'
  if (part === 'twilight') return 'twilight'
  return 'day'
}

// Operator opt-out toggle (Réglages ▸ Affichage). Persists the flag and either
// resumes the drift (caller recomputes the current part) or pins the 'manual'
// sentinel so the base palette shows.
export function setDaypartAuto(on: boolean): void {
  try {
    localStorage.setItem('babillard-daypart-auto', on ? '1' : '0')
  } catch {
    /* noop */
  }
  if (!on) setDayPart('manual')
}
