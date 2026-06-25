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
