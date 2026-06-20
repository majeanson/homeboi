// Accessibility profile (#36) — a SECOND set of presentation axes beyond the
// toddler lens: a high-contrast palette and a larger base text size, for a
// low-vision adult or a far-from-the-wall glance. Orthogonal to theme/daypart/
// audience/surface and NOT a permission boundary — it only changes how the same
// data is drawn. DOM-attribute driven exactly like theme.ts (data-contrast +
// data-text-scale on <html>), so the cascade in core.css does the work globally
// and a kiosk reboots into the chosen profile (theme-bootstrap.js applies both
// before first paint). localStorage for now, same as theme/calm.
export type Contrast = 'normal' | 'high'
export type TextScale = 'normal' | 'large'

export function getContrast(): Contrast {
  return document.documentElement.getAttribute('data-contrast') === 'high' ? 'high' : 'normal'
}

export function setContrast(c: Contrast): void {
  // 'normal' clears the attribute (the base palette shows) — mirrors the daypart
  // 'manual' sentinel idea: absence means default, presence means override.
  if (c === 'high') document.documentElement.setAttribute('data-contrast', 'high')
  else document.documentElement.removeAttribute('data-contrast')
  try {
    localStorage.setItem('babillard-contrast', c)
  } catch {
    /* noop */
  }
}

export function getTextScale(): TextScale {
  return document.documentElement.getAttribute('data-text-scale') === 'large' ? 'large' : 'normal'
}

export function setTextScale(s: TextScale): void {
  if (s === 'large') document.documentElement.setAttribute('data-text-scale', 'large')
  else document.documentElement.removeAttribute('data-text-scale')
  try {
    localStorage.setItem('babillard-text-scale', s)
  } catch {
    /* noop */
  }
}
