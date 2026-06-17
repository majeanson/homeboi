// Day/night toggle. theme-bootstrap.js sets the initial value before mount;
// this just flips + persists it. A wall tablet should dim at night.
export type Theme = 'day' | 'night'

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'night' ? 'night' : 'day'
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('babillard-theme', theme)
  } catch {
    /* noop */
  }
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
export type DayPart = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night'

export function isDaypartAuto(): boolean {
  try {
    return localStorage.getItem('babillard-daypart-auto') !== '0'
  } catch {
    return true
  }
}

export function getDayPart(): DayPart | 'manual' {
  const attr = document.documentElement.getAttribute('data-daypart')
  if (
    attr === 'dawn' ||
    attr === 'morning' ||
    attr === 'afternoon' ||
    attr === 'dusk' ||
    attr === 'night'
  ) {
    return attr
  }
  return 'manual'
}

export function setDayPart(part: DayPart | 'manual'): void {
  document.documentElement.setAttribute('data-daypart', part)
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
