// Scale an ingredient line's quantities by a factor, so a recipe written for N
// servings can be cooked for any number (half a batch, double, cook-for-6).
//
// Scales EVERY measurement in the line, not just the leading one — both the
// primary amount and any alternate measure in a parenthetical ("15 ml (1 c. à
// soupe) de beurre" → "30 ml (2 c. à soupe) de beurre"). Earlier this only
// touched the leading ml/g and left the spoon/cup behind, so the two halves of
// the line disagreed after scaling.
//
// Deliberately forgiving (NFR-DEGRADE): it rescales a quantity only when it can
// confidently read it — the leading amount, or any amount directly before a
// known unit. "salt to taste" passes through untouched. When a scaled spoon/cup
// amount won't land on a tidy fraction a cook can actually measure (e.g. 0.83
// tasse), it falls back to a "times" form — "2½× ⅓ tasse" — instead of an
// unmeasurable decimal.
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

// A letter just past a unit means it's the head of a longer word — JS \b is
// ASCII-only so it mis-fires after accented letters; this lookahead doesn't.
const NOT_LETTER = `(?![a-zà-ÿ])`
// The measuring units that mark "this number is an amount to scale". Scoopable
// tools (spoon/cup, FR+EN, many spellings — mirrors measure.ts), then metric and
// imperial volume/weight. Multi-letter forms come before single (kg before g, ml
// before l) so the longer unit wins.
const TSP =
  `cuill[èe]res?\\s*(?:à|a)\\s*(?:th[ée]s?|caf[ée]s?)` +
  `|c\\.?\\s*(?:à|a)\\.?\\s*(?:th[ée]s?|caf[ée]s?|t|c)${NOT_LETTER}\\.?` +
  `|c[àa][tc]` +
  `|tsp|teaspoons?`
const TBSP =
  `cuill[èe]res?\\s*(?:à|a)\\s*(?:soupe|table)` +
  `|c\\.?\\s*(?:à|a)\\.?\\s*(?:soupe|table|s)${NOT_LETTER}\\.?` +
  `|c[àa]s` +
  `|tbsp|tbs|tablespoons?`
const CUP = `tasses?|cups?`
const METRIC = `kg|mg|cl|dl|ml|g|l`
const IMPERIAL = `oz|lbs|lb`
const UNIT = `(?:${TSP}|${TBSP}|${CUP}|${METRIC}|${IMPERIAL})`
// A quantity directly before a unit, anywhere in the line (so a parenthetical
// alternate measure scales too). Groups: 1 = qty, 2 = separator, 3 = unit.
const QTY_UNIT = new RegExp(`(${Q})(\\s*)(${UNIT})${NOT_LETTER}\\.?`, 'giu')

// Parse one already-isolated quantity token to a number. Returns NaN if it
// somehow doesn't match (callers treat NaN as "leave it alone").
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
const SNAP_TOL = 0.04

// Whether a value lands close enough to a whole number or a measurable fraction
// to render tidily — i.e. an amount a cook can actually scoop. Drives the "times"
// fallback: a value that ISN'T clean (0.83 tasse) reads better as "2½× ⅓ tasse".
function snapsClean(v: number): boolean {
  if (!isFinite(v) || v <= 0) return false
  const frac = v - Math.floor(v + 1e-9)
  return NICE.some(([val]) => Math.abs(frac - val) < SNAP_TOL)
}

// Render a scaled number back to a tidy string: whole + nearest nice fraction
// when close enough, otherwise a trimmed 2-decimal value.
export function formatQty(v: number): string {
  if (!isFinite(v) || v <= 0) return '0'
  const whole = Math.floor(v + 1e-9)
  const frac = v - whole
  let best: { val: number; sym: string } | null = null
  let bestErr = SNAP_TOL
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

// Render one scaled measurement (qty + unit). A clean result reads as the scaled
// amount ("2 c. à soupe"); an un-scoopable one falls back to the "times" form
// ("2½× ⅓ tasse") so the cook multiplies the original tool instead of chasing a
// decimal. `factor` drives the fallback multiplier text.
function renderMeasure(qtyTok: string, sep: string, unitTok: string, factor: number): string | null {
  const v = valueOf(qtyTok)
  if (!isFinite(v)) return null
  const scaled = v * factor
  if (snapsClean(scaled)) return `${formatQty(scaled)}${sep}${unitTok}`
  return `${formatQty(factor)}× ${qtyTok}${sep}${unitTok}`
}

// Rescale every readable quantity in one ingredient line. Lines with nothing
// readable, and factor===1, pass through unchanged.
export function scaleLine(line: string, factor: number): string {
  if (factor === 1 || !isFinite(factor) || factor <= 0) return line

  // Targets to rewrite, as {start, end, text} on the ORIGINAL string — applied
  // right-to-left at the end so earlier indices stay valid.
  const targets: { start: number; end: number; text: string }[] = []

  // 1. Every "qty + unit" measurement, anywhere (handles parentheticals and any
  //    non-leading measure). matchAll advances past each, so they don't overlap.
  let firstUnitStart = Infinity
  for (const m of line.matchAll(QTY_UNIT)) {
    const text = renderMeasure(m[1], m[2], m[3], factor)
    if (text == null) continue
    const start = m.index!
    targets.push({ start, end: start + m[0].length, text })
    firstUnitStart = Math.min(firstUnitStart, start)
  }

  // 2. The leading quantity when it has NO unit (a bare count — "3 eggs", or a
  //    range "2-3 cloves"). Skipped when the leading amount is already a
  //    qty+unit measure handled above (no double-scaling).
  const lead = line.match(LEADING)
  if (lead) {
    const leadStart = lead.index! + (lead[0].length - lead[0].trimStart().length)
    const alreadyMeasure = firstUnitStart <= leadStart && firstUnitStart < lead.index! + lead[0].length
    const a = valueOf(lead[1])
    if (!alreadyMeasure && isFinite(a)) {
      const rest = ''
      let text: string | null = null
      if (lead[3]) {
        const b = valueOf(lead[3])
        if (isFinite(b)) text = `${formatQty(a * factor)}–${formatQty(b * factor)}${rest}`
      } else {
        text = `${formatQty(a * factor)}${rest}`
      }
      if (text != null) targets.push({ start: lead.index!, end: lead.index! + lead[0].length, text })
    }
  }

  if (!targets.length) return line
  targets.sort((x, y) => y.start - x.start)
  let out = line
  for (const t of targets) out = out.slice(0, t.start) + t.text + out.slice(t.end)
  return out
}

export function scaleIngredients(lines: string[], factor: number): string[] {
  if (factor === 1) return lines
  return lines.map((l) => scaleLine(l, factor))
}
