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
