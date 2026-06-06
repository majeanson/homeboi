// Scale an ingredient line's leading quantity by a factor, so a recipe written
// for N servings can be cooked for any number (half a batch, double, cook-for-6).
//
// Deliberately forgiving: it only rescales a quantity it can confidently read at
// the START of the line and leaves everything else byte-for-byte. A line with no
// leading number ("salt to taste") passes through untouched — scaling is a bonus
// on top of the written recipe, never a rewrite of it (NFR-DEGRADE).
//
// Understands: integers (2), decimals with . or , (1.5 / 1,5), ascii fractions
// (1/2), unicode vulgar fractions (½), mixed numbers (1 1/2, 1½) and ranges
// (2-3, 2–3). Output prefers a tidy unicode fraction so amounts read like a
// cookbook rather than 0.6666 cups.

const UNICODE_FRAC: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅐': 1 / 7,
  '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
  '⅑': 1 / 9, '⅒': 1 / 10,
}
const FRAC = Object.keys(UNICODE_FRAC).join('')

// A single quantity token, alternation ordered longest/most-specific first so
// "1 1/2" is read whole rather than as a bare "1".
const Q =
  `\\d+\\s+\\d+\\/\\d+` + // mixed ascii: 1 1/2
  `|\\d+\\s*[${FRAC}]` + // mixed unicode: 1½ / 1 ½
  `|\\d+\\/\\d+` + // ascii fraction: 1/2
  `|[${FRAC}]` + // unicode fraction alone: ½
  `|\\d+[.,]\\d+` + // decimal: 1.5 / 1,5
  `|\\d+` // integer: 2
// Leading quantity, optionally a range (low–high). Capture groups:
// 1 = first qty, 3 = second qty of a range (undefined when not a range).
const LEADING = new RegExp(`^\\s*(${Q})(\\s*[-–—]\\s*(${Q}))?`)

// Parse one already-isolated quantity token to a number. Returns NaN if it
// somehow doesn't match (callers treat NaN as "leave the line alone").
function valueOf(tok: string): number {
  tok = tok.trim()
  let m = tok.match(/^(\d+)\s+(\d+)\/(\d+)$/) // 1 1/2
  if (m) return +m[1] + +m[2] / +m[3]
  m = tok.match(new RegExp(`^(\\d+)\\s*([${FRAC}])$`)) // 1½
  if (m) return +m[1] + UNICODE_FRAC[m[2]]
  m = tok.match(/^(\d+)\/(\d+)$/) // 1/2
  if (m) return +m[1] / +m[2]
  if (UNICODE_FRAC[tok] != null) return UNICODE_FRAC[tok] // ½
  return parseFloat(tok.replace(',', '.')) // 2 / 1.5
}

// Fractions we'll snap a scaled amount onto, with their unicode glyph. Kitchen
// amounts read better as eighths/thirds than as long decimals.
const NICE: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'],
  [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
]

// Render a scaled number back to a tidy string: whole + nearest nice fraction
// when close enough, otherwise a trimmed 2-decimal value.
export function formatQty(v: number): string {
  if (!isFinite(v) || v <= 0) return '0'
  const whole = Math.floor(v + 1e-9)
  const frac = v - whole
  let best: { val: number; sym: string } | null = null
  let bestErr = 0.04
  for (const [val, sym] of NICE) {
    const err = Math.abs(frac - val)
    if (err < bestErr) {
      bestErr = err
      best = { val, sym }
    }
  }
  if (best) {
    const w = best.val === 1 ? whole + 1 : whole
    const sym = best.val === 1 ? '' : best.sym
    if (sym) return w ? `${w} ${sym}` : sym
    return String(w)
  }
  return String(Math.round(v * 100) / 100).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

// Rescale the leading quantity of one ingredient line. Lines without a readable
// leading number, and factor===1, pass through unchanged.
export function scaleLine(line: string, factor: number): string {
  if (factor === 1 || !isFinite(factor) || factor <= 0) return line
  const m = line.match(LEADING)
  if (!m) return line
  const a = valueOf(m[1])
  if (!isFinite(a)) return line
  const rest = line.slice(m[0].length)
  if (m[3]) {
    const b = valueOf(m[3])
    if (isFinite(b)) return `${formatQty(a * factor)}–${formatQty(b * factor)}${rest}`
  }
  return `${formatQty(a * factor)}${rest}`
}

export function scaleIngredients(lines: string[], factor: number): string[] {
  if (factor === 1) return lines
  return lines.map((l) => scaleLine(l, factor))
}
