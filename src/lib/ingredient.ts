// Client mirror of functions/_lib/ingredient.ts — strip a recipe ingredient LINE
// to its buyable NAME for the grocery-list confirm chips, so the preview matches
// what the server stores ("15 ml (1 c. à soupe) de beurre non salé" → "Beurre non
// salé"). The two trees don't share code; keep them identical. See the server
// copy for the doc + examples.
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
const FRACTIONS = /^[½¼¾⅓⅔⅛⅜⅝⅞]+$/
const NUMBER = /^\d+([.,/x-]\d+)*$/i

export function ingredientName(line: string): string {
  const cleaned = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return line.trim()
  const toks = cleaned.split(' ')
  let firstContent = -1
  for (let j = 0; j < toks.length; j++) {
    const bare = toks[j].toLowerCase().replace(/[.,;]+$/, '')
    const isQty = NUMBER.test(bare) || FRACTIONS.test(toks[j])
    if (!(isQty || UNITS.has(bare) || CONNECT.has(bare))) {
      firstContent = j
      break
    }
  }
  let name = firstContent > 0 ? toks.slice(firstContent).join(' ').trim() : cleaned
  name = name.replace(/^d['’]\s*/i, '').replace(/^(de|du|des|of|à|au|aux)\s+/i, '').trim()
  if (!name) name = cleaned
  return name.charAt(0).toUpperCase() + name.slice(1)
}
