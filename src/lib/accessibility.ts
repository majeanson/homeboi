// Accessibility profile (#36) — a SECOND set of presentation axes beyond the
// toddler lens: a high-contrast palette and a larger base text size, for a
// low-vision adult or a far-from-the-wall glance. Orthogonal to theme/daypart/
// audience/surface and NOT a permission boundary — it only changes how the same
// data is drawn. DOM-attribute driven exactly like theme.ts (data-contrast +
// data-text-scale on <html>), so the cascade in core.css does the work globally
// and a kiosk reboots into the chosen profile (theme-bootstrap.js applies both
// before first paint). localStorage for now, same as theme/calm.
export type Contrast = 'normal' | 'high'
// STILL TWO STEPS, and that is now a measured decision rather than an untested default.
//
// The case for a third is real: this app turns OFF browser pinch-zoom app-wide
// (index.html — maximum-scale=1 + user-scalable=no, because zoom made the fixed
// full-screen overlays shimmer and re-anchor mid-gesture), so axe reports
// `meta-viewport` on every state and THIS control is the only remedy a reader has
// left. 115% is a thin thing to offer in exchange for a browser affordance we removed,
// and the next rung up (`[data-lens='simple']`, 140%) is a different presentation
// entirely, not a text size.
//
// So a third step was built and shot at 360px (2026-09-15), and it clipped « Bon
// après-midi » to « Bon après- » at 130%, 122% and every value between. `.greet` sizes
// itself off the container left over beside the header's fixed button cluster, and the
// ramp takes that container away faster than the compensator below gives it back. The
// two chrome offenders THAT pass found are fixed and shipped (see --chrome-scale in
// core.css — one of them, « Réglages » cut to « Réglag… » in the tab bar, was already
// shipping at the 115% step nobody had ever photographed). The greeting is not: it
// carries three rounds of sizing history in today.css and deserves its own pass, not a
// fourth constant tacked onto this enum.
//
// Ship the third step when `.greet` reads whole at 130% on `board-large`/`liste-large`.
// Nothing else is in the way.
export type TextScale = 'normal' | 'large'
export const TEXT_SCALES: readonly TextScale[] = ['normal', 'large'] as const

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
