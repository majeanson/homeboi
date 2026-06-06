// Normalize a free-typed grocery item into a stable grouping key, so the ghost
// list can tell that "Œufs", "oeufs" and "2 douzaines d'œufs" are all the same
// thing. Deterministic and accent/quantity-insensitive — NOT a display value
// (the original text is kept separately for showing).
//
// Steps: lowercase -> fold ligatures + diacritics (oeufs, cafe) -> drop a
// leading quantity/unit run ("2 douzaines d", "500 g", "1l") -> drop a trailing
// "x2" multiplier -> strip stray punctuation -> collapse whitespace.

// Units we strip when they trail a leading number. FR + EN, singular/plural.
const UNITS = [
  'x',
  'kg', 'kgs', 'g', 'gr', 'gramme', 'grammes', 'gram', 'grams', 'mg',
  'l', 'ml', 'cl', 'dl', 'litre', 'litres', 'liter', 'liters',
  'lb', 'lbs', 'oz',
  'dz', 'dozen', 'dozens', 'douzaine', 'douzaines',
  'pqt', 'paquet', 'paquets', 'pack', 'packs', 'pkg',
  'boite', 'boites', 'can', 'cans', 'canne', 'cannes', 'conserve', 'conserves',
  'sac', 'sacs', 'bag', 'bags', 'bouteille', 'bouteilles', 'bottle', 'bottles',
  'pot', 'pots', 'contenant', 'contenants', 'barquette', 'barquettes',
  'tranche', 'tranches', 'slice', 'slices', 'unite', 'unites', 'unit', 'units',
]

const NUM = String.raw`\d+(?:[.,/]\d+)?`
// \b after the unit so "1 lait" doesn't strip the "l" of "lait" as a litre unit;
// alternation order is harmless because the boundary forces the full-word match.
const UNIT = `(?:${UNITS.join('|')})\\b`
// One or more leading "number [unit] [de/d'/of]" groups, e.g. "2 douzaines d ".
const LEADING_QTY = new RegExp(
  String.raw`^(?:${NUM}\s*(?:${UNIT})?\.?\s*(?:de\s+|d\s+|of\s+)?)+`,
)
// A trailing explicit multiplier like "pain x2".
const TRAILING_MULT = /\s+x\s*\d+$/
// Combining diacritical marks (U+0300–U+036F), removed after NFD.
const DIACRITICS = /[̀-ͯ]/g
const APOSTROPHES = /['’]/g
const PUNCT = /[^\p{L}\p{N}\s-]/gu

function fold(s: string): string {
  return s
    .replace(/œ/g, 'oe') // œ
    .replace(/æ/g, 'ae') // æ
    .normalize('NFD')
    .replace(DIACRITICS, '')
}

export function normalizeItem(text: string): string {
  let s = fold(text.toLowerCase())
  // Apostrophes (straight + curly) become spaces so "d'oeufs" splits cleanly.
  s = s.replace(APOSTROPHES, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(LEADING_QTY, '')
  s = s.replace(TRAILING_MULT, '')
  s = s.replace(PUNCT, '').replace(/\s+/g, ' ').trim()
  return s
}
