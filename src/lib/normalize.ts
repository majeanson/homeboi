// Shared search fold: lowercase + strip diacritics so substring matching is
// accent-insensitive (Québécois: souper vs soupér, Léa vs Lea). Punctuation is
// PRESERVED (unlike cookCommands' foldCmd, which also collapses punctuation) so a
// needle keeps apostrophes/hyphens. Same combining-mark range EntityCombobox used
// before this was extracted, so matching behaviour is unchanged.
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Every occurrence of `needle` inside `text`, matched through fold() (accent- and
// case-insensitive) but returned as [start, end) index pairs into the ORIGINAL
// string — so a highlighter can wrap « Réglages » when the user typed "reglages".
// Folded per-character (a char may fold to 0 or more chars) with a folded→original
// index map, since fold() can change string length.
export function foldRanges(text: string, needle: string): [number, number][] {
  const n = fold(needle)
  if (!n) return []
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i])
    for (let j = 0; j < f.length; j++) {
      folded += f[j]
      map.push(i)
    }
  }
  const out: [number, number][] = []
  let at = folded.indexOf(n)
  while (at !== -1) {
    let end = map[at + n.length - 1] + 1
    // A decomposed (NFD) original carries combining marks AFTER their base char;
    // they fold to '' so they have no folded index — pull any trailing ones into
    // the range so a highlight never splits « à » from its accent.
    while (end < text.length && fold(text[end]) === '') end++
    out.push([map[at], end])
    at = folded.indexOf(n, at + n.length)
  }
  return out
}

// Normalize a free-typed grocery item into a stable grouping KEY (accent- AND
// quantity-insensitive), so "Œufs", "oeufs" and "2 douzaines d'œufs" share one
// identity. A faithful client port of functions/_lib/normalize.ts (same steps), so a
// per-item aisle override (Réglages-free, set in the edit sheet) sticks to the item
// the same way the ghost/purchase keys do server-side. Pure string logic; kept in
// sync by hand with the worker copy (both rarely change).
// prettier-ignore
const QTY_UNITS = [
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
const UNIT = `(?:${QTY_UNITS.join('|')})\\b`
const LEADING_QTY = new RegExp(String.raw`^(?:${NUM}\s*(?:${UNIT})?\.?\s*(?:de\s+|d\s+|of\s+)?)+`)
const TRAILING_MULT = /\s+x\s*\d+$/
const APOSTROPHES = /['’]/g
const ITEM_PUNCT = /[^\p{L}\p{N}\s-]/gu

export function normalizeItem(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  s = s.replace(APOSTROPHES, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(LEADING_QTY, '')
  s = s.replace(TRAILING_MULT, '')
  s = s.replace(ITEM_PUNCT, '').replace(/\s+/g, ' ').trim()
  return s
}
