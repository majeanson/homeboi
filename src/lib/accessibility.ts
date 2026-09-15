// Accessibility profile (#36) — a SECOND set of presentation axes beyond the
// toddler lens: a high-contrast palette and a larger base text size, for a
// low-vision adult or a far-from-the-wall glance. Orthogonal to theme/daypart/
// audience/surface and NOT a permission boundary — it only changes how the same
// data is drawn. DOM-attribute driven exactly like theme.ts (data-contrast +
// data-text-scale on <html>), so the cascade in core.css does the work globally
// and a kiosk reboots into the chosen profile (theme-bootstrap.js applies both
// before first paint). localStorage for now, same as theme/calm.
export type Contrast = 'normal' | 'high'
// THREE steps — 100% / 115% / 130% — and the third is load-bearing rather than a
// nicety. This app turns OFF browser pinch-zoom app-wide (index.html: maximum-scale=1
// + user-scalable=no, because zoom made the fixed full-screen overlays shimmer and
// re-anchor mid-gesture), so axe reports `meta-viewport` on every state and THIS
// control is the only remedy a reader has left. 115% alone was a thin thing to offer
// in exchange for a browser affordance we removed, and the next rung up
// (`[data-lens='simple']`, 140%) is a different presentation entirely, not a text size.
//
// IT WAS HELD FOR HALF A DAY, and how it came unstuck is the lesson. Shot at 360px the
// board greeting clipped to « Bon après- », so the step was pulled and the blocker
// written down. Re-opened, the cause was NOT the ramp and not `.greet`'s three rounds
// of sizing history: it was ONE uncompensated child of the header's fixed button
// cluster. Measured across the ramp, that cluster went 197 → 202 → 208px while every
// other child held — 11px, all of it taken from the container the greeting sizes
// itself against. With `.help-toggle` on `--chrome-scale` the cluster is 197px at
// every scale and nothing is cut at 390 or 360.
//
// The moral is the measurement, not the fix: « the greeting needs its own pass » was a
// plausible, expensive, WRONG diagnosis reached by looking at a screenshot. Four
// numbers found the real one in ten minutes.
//
// Honest about the ceiling: 130% is not WCAG 1.4.4's 200%. It is the largest step the
// rem tree takes without the px-sized chrome breaking, and the real fix for that gap
// is to unwind the px, not to widen this enum again.
export type TextScale = 'normal' | 'large' | 'x-large'
export const TEXT_SCALES: readonly TextScale[] = ['normal', 'large', 'x-large'] as const

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
  const v = document.documentElement.getAttribute('data-text-scale')
  // Read against the known set rather than testing one value: an unrecognised
  // attribute — a devtools edit, or the 'x-large' left over from the third step
  // trialled and held on 2026-09-15 — must read as 'normal', never as "not this,
  // therefore that". TEXT_SCALES is the set, so this cannot drift from the enum.
  return (TEXT_SCALES as readonly string[]).includes(v ?? '') ? (v as TextScale) : 'normal'
}

export function setTextScale(s: TextScale): void {
  // 'normal' CLEARS the attribute (absence means default, presence means override) —
  // the same sentinel idea as setContrast above and the daypart 'manual' flag.
  if (s !== 'normal') document.documentElement.setAttribute('data-text-scale', s)
  else document.documentElement.removeAttribute('data-text-scale')
  try {
    localStorage.setItem('babillard-text-scale', s)
  } catch {
    /* noop */
  }
}
