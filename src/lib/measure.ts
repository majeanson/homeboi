// Find the "scoopable" measurements in a recipe ingredient line — the ones that
// map to a physical, colour-coded measuring spoon or cup: teaspoon (c. à thé),
// tablespoon (c. à soupe) and cup (tasse), in FR + EN with their many spellings.
// Each match carries the quantity + unit so a pill can be tinted to match the
// real measuring tool AND read aloud ("un quart de cuillère à thé"), so a child
// (or a parent) can hear the amount and grab the right-coloured spoon.
//
// Deliberately narrow + forgiving, the same tenet as duration.ts / scale.ts: it
// only pills a measurement it can confidently read, anywhere in the line —
// INCLUDING inside a parenthetical like "15 ml (1 c. à thé) de beurre", because
// that parenthetical IS the spoon the cook reaches for. Volume/weight units
// (ml, g) have no colour-coded tool, so they are intentionally NOT matched.

import type { Lang } from '../i18n'

export type MeasureUnit = 'tsp' | 'tbsp' | 'cup'

export interface Measure {
  text: string // the matched substring, verbatim ("1 c. à thé")
  start: number // index in the line where the match begins
  end: number // index just past the match
  qty: string // canonical quantity key ("1/4", "1", "1 1/2")
  unit: MeasureUnit // canonical unit key
  key: string // `${qty}|${unit}` — the colour-map key ("1/4|tsp")
  value: number // numeric quantity (0.25), for pluralisation / spoken form
}

// Unicode vulgar fractions → value, mirrored from scale.ts so a scaled line that
// renders "¼ c. à thé" still reads as a quarter-teaspoon.
const UNICODE_FRAC: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅐': 1 / 7,
  '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
  '⅑': 1 / 9, '⅒': 1 / 10,
}
const FRAC = Object.keys(UNICODE_FRAC).join('')

// A single quantity token, longest/most-specific first so "1 1/2" reads whole
// rather than as a bare "1". Same shape as scale.ts's Q.
const Q =
  `\\d+\\s+\\d+\\/\\d+` + // mixed ascii: 1 1/2
  `|\\d+\\s*[${FRAC}]` + // mixed unicode: 1½ / 1 ½
  `|\\d+\\/\\d+` + // ascii fraction: 1/2
  `|[${FRAC}]` + // unicode fraction alone: ½
  `|\\d+[.,]\\d+` + // decimal: 1.5 / 1,5
  `|\\d+` // integer: 2

// The three colour-coded tools. The short abbreviations are disjoint on their
// discriminator letter (thé/café/t/c for the spoon-of-tea, soupe/table/s for the
// spoon-of-soup), so "c. à s." never reads as a teaspoon and vice-versa. The
// letter-lookahead after a single-letter discriminator stops "c. à t." from
// eating the "t" of "c. à table". (A plain \b can't be used here: JS \b is
// ASCII-only, so it would wrongly fail right after an accented "thé"/"café".)
const NOT_LETTER = `(?![a-zà-ÿ])`
const TSP =
  `cuill[èe]res?\\s*(?:à|a)\\s*(?:th[ée]s?|caf[ée]s?)` + // cuillère à thé / café
  `|c\\.?\\s*(?:à|a)\\.?\\s*(?:th[ée]s?|caf[ée]s?|t|c)${NOT_LETTER}\\.?` + // c. à thé / c. à t. / c. à c.
  `|c[àa][tc]` + // càt / càc
  `|tsp|teaspoons?`
const TBSP =
  `cuill[èe]res?\\s*(?:à|a)\\s*(?:soupe|table)` + // cuillère à soupe / table
  `|c\\.?\\s*(?:à|a)\\.?\\s*(?:soupe|table|s)${NOT_LETTER}\\.?` + // c. à soupe / c. à table / c. à s.
  `|c[àa]s` + // càs
  `|tbsp|tbs|tablespoons?`
const CUP = `tasses?|cups?`

// An optional connector between the amount and the unit — QC recipes write "¼ DE
// tasse" (a quarter OF a cup), not just "¼ tasse". Optional, so "1 c. à thé" and
// "3/4 tasse" still match, while "1/4 de tasse" now reads as a quarter-cup (needed
// for the colour pills AND the metric→fraction repair below).
const CONNECT = `(?:de\\s+|d['’]\\s*|of\\s+)?`

// One scan over the line. The negative lookahead stops a unit from matching the
// head of a longer word ("2 cups" yes, "2 cupcakes" no).
const TOKEN = new RegExp(
  `(?<qty>${Q})\\s*${CONNECT}(?:(?<tsp>${TSP})|(?<tbsp>${TBSP})|(?<cup>${CUP}))(?![a-zà-ÿ])`,
  'giu',
)

// Parse one isolated quantity token to a number (NaN if unreadable → skipped).
function parseQty(tok: string): number {
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

// Fractions a value can snap to, with their canonical ascii key. Mirrors scale.ts
// NICE so "0.25 tasse" and "¼ tasse" and "1/4 tasse" all key to "1/4|cup".
const NICE: [number, string][] = [
  [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'],
  [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'],
]

// A value → the canonical colour-map quantity key: "1", "1/4", "1 1/2". The whole
// and fractional parts are split so a mixed amount keys consistently.
export function qtyKey(value: number): string {
  if (!isFinite(value) || value <= 0) return '0'
  const whole = Math.floor(value + 1e-9)
  const frac = value - whole
  let best: string | null = null
  let bestErr = 0.04
  for (const [val, sym] of NICE) {
    const err = Math.abs(frac - val)
    if (err < bestErr) {
      bestErr = err
      best = sym
    }
  }
  if (frac < 0.04) return String(whole) // a clean whole number
  if (best) return whole ? `${whole} ${best}` : best
  // An amount that isn't a tidy fraction — keep a trimmed decimal so it still
  // keys deterministically (rare for a spoon/cup, but never throw it away).
  return String(Math.round(value * 100) / 100)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

// Every scoopable measurement in the line, in reading order, non-overlapping
// (matchAll advances past each match). Empty array when there's nothing to pill.
export function findMeasures(line: string): Measure[] {
  const out: Measure[] = []
  for (const m of line.matchAll(TOKEN)) {
    const g = m.groups!
    const value = parseQty(g.qty)
    if (!isFinite(value) || value <= 0) continue
    const unit: MeasureUnit = g.tsp ? 'tsp' : g.tbsp ? 'tbsp' : 'cup'
    const qty = qtyKey(value)
    out.push({
      text: m[0],
      start: m.index!,
      end: m.index! + m[0].length,
      qty,
      unit,
      key: `${qty}|${unit}`,
      value,
    })
  }
  return out
}

// ---- Conversion cross-check (OCR sanity) ---------------------------------- //
// Québec recipes very often print BOTH units — "1,25 ml (1/4 c. à thé)",
// "180 ml (3/4 tasse)" — which makes the line self-checking: convert the scoopable
// imperial amount to millilitres and compare it to the printed ml. A big gap means
// one was MIS-READ (OCR drops a decimal comma → "1,25 ml" becomes "125 ml", or a
// vulgar fraction → "%"). We don't guess a fix — we just surface the line so the
// cook checks it against the photo. Canadian/metric kitchen convention.
const ML_PER: Record<MeasureUnit, number> = { tsp: 5, tbsp: 15, cup: 250 }
const METRIC_ML = /(\d+(?:[.,]\d+)?)\s*ml\b/i

// The dual-printed weight pair, same self-checking idea: "225 g (1/2 lb)". The lb
// amount may be a fraction; the gram side is always plain digits.
const METRIC_G = /(\d+(?:[.,]\d+)?)\s*(?:g|grammes?)\b/i
const IMPERIAL_LB = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(?:lbs?|livres?|pounds?)\b/i
const G_PER_LB = 453.6

// Kitchen-rounding band shared by both cross-checks. QC print rounds ¼ cup to
// 60 ml (0.96×) and ⅓ cup to 80 ml (0.96×); real mis-reads — a dropped comma
// (~10–100×), a flipped fraction, a 6 read as an 8 (0.64×) — land well outside.
// The old 0.55–1.8 band was wide enough to let a 6↔8 misread through unflagged.
const agreeIsh = (printed: number, expected: number): boolean =>
  printed >= expected * 0.7 && printed <= expected * 1.45

// True when a line prints the SAME amount in two units that DISAGREE beyond
// kitchen-rounding tolerance — ml vs a scoopable cup/spoon, or g vs lb — meaning
// one of the two was MIS-READ. No dual units on the line → false.
export function measuresDisagree(line: string): boolean {
  const ml = METRIC_ML.exec(line)
  if (ml) {
    const printed = parseFloat(ml[1].replace(',', '.'))
    if (isFinite(printed) && printed > 0) {
      for (const m of findMeasures(line)) {
        if (!agreeIsh(printed, m.value * ML_PER[m.unit])) return true
      }
    }
  }
  const g = METRIC_G.exec(line)
  const lb = g ? IMPERIAL_LB.exec(line) : null
  if (g && lb) {
    const grams = parseFloat(g[1].replace(',', '.'))
    const pounds = parseQty(lb[1])
    if (isFinite(grams) && grams > 0 && isFinite(pounds) && pounds > 0 && !agreeIsh(grams, pounds * G_PER_LB)) return true
  }
  return false
}

// ---- Repair a garbled fraction FROM the metric (OCR rescue) --------------- //
// The key insight from real recipe photos: the plain "60 ml" survives OCR perfectly,
// but the tiny vulgar fraction beside it ("¼ de tasse") comes out as junk ("Ÿ", "A",
// "%"). Since the recipe prints BOTH and they're redundant, we rebuild the imperial
// fraction FROM the reliable millilitres: 60 ml ÷ 250 ml/cup ≈ ¼ → "1/4 de tasse".
// Conservative — only when the ml lands cleanly on a standard kitchen fraction; a
// nonsense value (a dropped comma made "1,25 ml" into "125 ml" → 25 tsp) is left as
// is for the verify panel to flag. The unit word survives OCR; only its amount didn't.

// Standard kitchen amounts a derived value may snap to. Ascending, generous tolerance
// absorbs QC rounding (¼ cup is printed 60 ml, not 62.5).
const NICE_AMOUNTS: [number, string][] = [
  [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'],
  [1, '1'], [1.25, '1 1/4'], [4 / 3, '1 1/3'], [1.5, '1 1/2'], [2, '2'], [2.5, '2 1/2'], [3, '3'], [4, '4'],
]
function snapAmount(v: number): string | null {
  for (const [val, sym] of NICE_AMOUNTS) if (Math.abs(v - val) <= val * 0.12) return sym
  return null
}
// The unit named inside the parenthetical (even when its amount is garbled), and the
// millilitres it represents — Canadian/metric kitchen convention.
const UNIT_IN_PAREN =
  /cuill[èe]res?\s*(?:à|a)\s*(?:soupe|table|th[ée]s?|caf[ée]s?)|c\.?\s*(?:à|a)\.?\s*(?:soupe|table|th[ée]s?|caf[ée]s?|[tcs])\b\.?|tasses?|cups?|tbsp|tbs|tsp/i
const mlPerUnit = (unit: string): number =>
  /tasse|cup/i.test(unit) ? 250 : /soupe|table|tbsp|tbs|(?:à|a)\.?\s*s\b/i.test(unit) ? 15 : 5
const ML_PAREN = /(\d+(?:[.,]\d+)?)\s*ml\s*\(\s*([^)]*?)\s*\)/i

// Rewrite "60 ml (<garbled> de tasse)" → "60 ml (1/4 de tasse)" using the ml. Returns
// the line unchanged when there's no "<n> ml ( … unit … )" shape, or when the ml
// doesn't convert to a clean fraction (we never invent an amount).
//
// GATED on the paren amount being actually unreadable. This used to rewrite
// UNCONDITIONALLY, trusting the ml — but the ml side gets mis-read too ("60" with
// its 6 read as an 8), and then a perfectly-read "¼ de tasse" was silently flipped
// to "1/3 de tasse"… and the rewritten line, now self-consistent, sailed past the
// verify panel's mismatch flag. The users' "1/2 tasse became 1/3" reports were
// THIS, not the OCR. When both sides are legible and disagree, we repair nothing:
// measuresDisagree flags the line and the cook checks the photo — never guess
// which of the two numbers lied.
export function repairImperialFromMetric(line: string): string {
  const m = ML_PAREN.exec(line)
  if (!m) return line
  const ml = parseFloat(m[1].replace(',', '.'))
  if (!isFinite(ml) || ml <= 0) return line
  const inner = m[2]
  if (findMeasures(inner).length > 0) return line // the paren already reads cleanly — hands off
  const u = UNIT_IN_PAREN.exec(inner)
  if (!u) return line
  const snapped = snapAmount(ml / mlPerUnit(u[0]))
  if (!snapped) return line
  // Keep the unit phrase verbatim (including a leading "de "); swap only the amount.
  let start = u.index
  const de = inner.slice(0, start).match(/\b(?:de|d['’]|of)\s*$/i)
  if (de) start -= de[0].length
  const unitPhrase = inner.slice(start).trim()
  return line.slice(0, m.index) + `${m[1]} ml (${snapped} ${unitPhrase})` + line.slice(m.index + m[0].length)
}

// ---- Read-aloud phrasing -------------------------------------------------- //
// Expand a terse "1 c. à thé" into something a TTS voice says naturally in the
// current language ("une cuillère à thé"). A nicety on top of the pill — never
// load-bearing; if a piece is unknown we fall back to the digit/glyph.

const UNIT_WORD: Record<Lang, Record<MeasureUnit, [string, string]>> = {
  // [singular, plural]
  fr: { tsp: ['cuillère à thé', 'cuillères à thé'], tbsp: ['cuillère à soupe', 'cuillères à soupe'], cup: ['tasse', 'tasses'] },
  en: { tsp: ['teaspoon', 'teaspoons'], tbsp: ['tablespoon', 'tablespoons'], cup: ['cup', 'cups'] },
}

// A fraction key → its spoken form. FR reads "un quart de <unit>"; EN reads
// "a quarter <unit>" / "half a <unit>", so the templates differ per language.
const FRAC_SPOKEN: Record<Lang, Record<string, string>> = {
  fr: {
    '1/8': 'un huitième de', '1/4': 'un quart de', '1/3': 'un tiers de',
    '3/8': 'trois huitièmes de', '1/2': 'une demi', '5/8': 'cinq huitièmes de',
    '2/3': 'deux tiers de', '3/4': 'trois quarts de', '7/8': 'sept huitièmes de',
  },
  en: {
    '1/8': 'an eighth of a', '1/4': 'a quarter', '1/3': 'a third of a',
    '3/8': 'three eighths of a', '1/2': 'half a', '5/8': 'five eighths of a',
    '2/3': 'two thirds of a', '3/4': 'three quarters of a', '7/8': 'seven eighths of a',
  },
}
// Bare fraction words for the tail of a mixed amount ("one and a half cups").
const FRAC_BARE: Record<Lang, Record<string, string>> = {
  fr: { '1/8': 'un huitième', '1/4': 'un quart', '1/3': 'un tiers', '3/8': 'trois huitièmes', '1/2': 'demi', '5/8': 'cinq huitièmes', '2/3': 'deux tiers', '3/4': 'trois quarts', '7/8': 'sept huitièmes' },
  en: { '1/8': 'an eighth', '1/4': 'a quarter', '1/3': 'a third', '3/8': 'three eighths', '1/2': 'a half', '5/8': 'five eighths', '2/3': 'two thirds', '3/4': 'three quarters', '7/8': 'seven eighths' },
}
const INT_WORD: Record<Lang, Record<number, string>> = {
  fr: { 1: 'une', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix', 11: 'onze', 12: 'douze' },
  en: { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' },
}

// The natural-language phrase to narrate for a measure, e.g. fr "une demi tasse",
// en "half a cup", fr "deux cuillères à thé". Plural unit when the amount is ≥ 2.
export function spokenMeasure(m: Measure, lang: Lang): string {
  const [sing, plural] = UNIT_WORD[lang][m.unit]
  // FR keeps the singular for a one-and-a-fraction amount ("une tasse et demie");
  // EN pluralises it ("one and a half cups"). So FR pluralises at ≥ 2, EN at > 1.
  const unit = (lang === 'fr' ? m.value >= 2 : m.value > 1) ? plural : sing
  const intWord = (n: number) => INT_WORD[lang][n] ?? String(n)

  const slash = m.qty.indexOf('/')
  if (slash === -1) return `${intWord(+m.qty)} ${unit}` // a whole number

  const space = m.qty.indexOf(' ')
  if (space === -1) {
    // A bare fraction: "un quart de cuillère à thé" / "a quarter teaspoon".
    const frac = FRAC_SPOKEN[lang][m.qty]
    return frac ? `${frac} ${unit}` : `${m.qty} ${unit}`
  }
  // A mixed amount ("1 1/2"): "une et demi tasses" / "one and a half cups".
  const whole = m.qty.slice(0, space)
  const fracKey = m.qty.slice(space + 1)
  const bare = FRAC_BARE[lang][fracKey] ?? fracKey
  const join = lang === 'fr' ? 'et' : 'and'
  return `${intWord(+whole)} ${join} ${bare} ${unit}`
}

// The whole ingredient line, read naturally: each scoop measurement swapped for
// its spoken form so a TTS voice says "un quart de cuillère à thé de vanille"
// instead of mangling "1/4 c. à thé". A line with no measurement reads verbatim.
export function spokenIngredient(line: string, lang: Lang): string {
  const ms = findMeasures(line)
  if (!ms.length) return line
  let out = ''
  let cursor = 0
  for (const m of ms) {
    out += line.slice(cursor, m.start) + spokenMeasure(m, lang)
    cursor = m.end
  }
  return out + line.slice(cursor)
}
