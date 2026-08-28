// Contrast maths, so an ink/ground pair can be CHECKED rather than eyeballed.
//
// Every palette fix in this app so far started with someone noticing a label looked
// washed out; twice the number turned out to be far worse than it looked (2.4:1 on
// the twilight tier, 2.65:1 for --ink-faint on the night marigold wash — both text,
// both below even the 3:1 non-text floor). Eyes adapt to a palette. Ratios don't.
//
// WCAG 2.1 relative luminance + contrast ratio. Pure functions, no DOM — DevKit's
// « Contraste » panel renders them live per theme, and a unit test pins the palette.

export type Rgb = [number, number, number]

/** `#rrggbb` → channel triple. Accepts a leading `#` or not. */
export function parseHex(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const channel = (c: number): number => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance. */
export function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

/** Contrast ratio between two colours, 1 (identical) → 21 (black on white). */
export function contrast(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(typeof a === 'string' ? parseHex(a) : a)
  const lb = luminance(typeof b === 'string' ? parseHex(b) : b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** The bar a pair has to clear, by what it is. */
export type ContrastRole = 'body' | 'large' | 'nonText'
export const CONTRAST_MIN: Record<ContrastRole, number> = {
  body: 4.5, // small text — the default assumption
  large: 3, // ≥18.66px bold or ≥24px
  nonText: 3, // icons, borders, focus rings, state indicators
}

/** `AA` / `lg` / `FAIL` for a ratio against a role's minimum. */
export function verdict(ratio: number, role: ContrastRole = 'body'): 'AA' | 'lg' | 'FAIL' {
  if (ratio >= CONTRAST_MIN[role]) return 'AA'
  if (ratio >= CONTRAST_MIN.large) return 'lg'
  return 'FAIL'
}
