// Client mirror of functions/_lib/ingredient.ts — strip a recipe ingredient LINE
// to its buyable NAME for the grocery-list confirm chips, so the preview matches
// what the server stores ("15 ml (1 c. à soupe) de beurre non salé" → "Beurre non
// salé", "1 c. à soupe d'huile d'olive" → "Huile d'olive"). The two trees don't
// share code; keep them byte-identical. See the server copy for the doc + examples.
const UNITS = new Set([
  'g', 'gr', 'kg', 'mg', 'l', 'ml', 'cl', 'dl', 'oz', 'lb', 'lbs',
  'tasse', 'tasses', 'cup', 'cups', 'tsp', 'tbsp', 'càs', 'càc',
  'c', 'cuil', 'cuillere', 'cuillère', 'cuilleres', 'cuillères',
  'pincee', 'pincée', 'pincees', 'pincées', 'gousse', 'gousses',
  'tranche', 'tranches', 'boite', 'boîte', 'boites', 'boîtes',
  'pot', 'pots', 'sachet', 'sachets', 'paquet', 'paquets',
  'enveloppe', 'enveloppes', 'contenant', 'contenants',
  'bouteille', 'bouteilles', 'sac', 'sacs', 'lb.', 'kg.',
])
const CONNECT = new Set(['de', 'd', 'du', 'des', 'of', 'à', 'a', 'au', 'aux'])
// The multi-word spoon tool, in pieces: a stub ("c.", "cuillère") + "à" + a
// suffix ("soupe", "thé", "s", "t"…). Recognized as ONE unit so the suffix isn't
// mistaken for the ingredient ("1 c. à soupe d'huile" → "Huile", not "Soupe…").
const SPOON_STUB = new Set(['c', 'cuil', 'cuiller', 'cuillere', 'cuillère', 'cuilleres', 'cuillères'])
const SPOON_SUFFIX = new Set([
  'soupe', 'table', 'thé', 'thés', 'the', 'thes', 'café', 'cafe', 'cafés', 'cafes', 's', 't', 'c',
])
const FRACTIONS = /^[½¼¾⅓⅔⅛⅜⅝⅞]+$/
const NUMBER = /^\d+([.,/x-]\d+)*$/i

const bareOf = (tok: string) => tok.toLowerCase().replace(/[.,;]+$/, '')

export function ingredientName(line: string): string {
  const cleaned = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return line.trim()
  const toks = cleaned.split(' ')
  let j = 0
  while (j < toks.length) {
    const bare = bareOf(toks[j])
    if (SPOON_STUB.has(bare) && j + 2 < toks.length) {
      const conn = bareOf(toks[j + 1])
      const suf = bareOf(toks[j + 2])
      if ((conn === 'à' || conn === 'a') && SPOON_SUFFIX.has(suf)) {
        j += 3
        continue
      }
    }
    const isQty = NUMBER.test(bare) || FRACTIONS.test(toks[j])
    if (isQty || UNITS.has(bare) || CONNECT.has(bare)) {
      j++
      continue
    }
    break
  }
  let name = j > 0 ? toks.slice(j).join(' ').trim() : cleaned
  name = name.replace(/^d['’]\s*/i, '').replace(/^(de|du|des|of|à|au|aux)\s+/i, '').trim()
  if (!name) name = cleaned
  return name.charAt(0).toUpperCase() + name.slice(1)
}
