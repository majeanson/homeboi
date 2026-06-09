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

// One scan over the line. The negative lookahead stops a unit from matching the
// head of a longer word ("2 cups" yes, "2 cupcakes" no).
const TOKEN = new RegExp(
  `(?<qty>${Q})\\s*(?:(?<tsp>${TSP})|(?<tbsp>${TBSP})|(?<cup>${CUP}))(?![a-zà-ÿ])`,
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
