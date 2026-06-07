// Strip a recipe ingredient LINE down to the buyable item NAME — for the grocery
// list (you buy "beurre non salé", not "15 ml de"…) and for flyer search (a clean
// word like "œufs" finds far more deals than "2 œufs"). Display-friendly: keeps
// the original casing/accents of the item, just drops the leading quantity, unit,
// parenthetical, and connector run, then capitalizes the first letter.
//
//   "15 ml (1 c. à soupe) de beurre non salé" -> "Beurre non salé"
//   "2 œufs"                                   -> "Œufs"
//   "400 g de pâtes"                           -> "Pâtes"
//   "1 1/2 tasse de farine tout usage"         -> "Farine tout usage"
//   "Sel et poivre"                            -> "Sel et poivre"  (no qty → as-is)
//
// Deliberately conservative: it only strips a LEADING measurement run, so a real
// ingredient word is never mistaken for a unit (e.g. "soupe" is not dropped).

// Units / containers that follow a quantity. 'c' covers the "c. à soupe/thé" stub
// once the parenthetical is removed; trailing punctuation is stripped before match.
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
// Connector words between a quantity/unit and the item.
const CONNECT = new Set(['de', 'd', 'du', 'des', 'of', 'à', 'a', 'au', 'aux'])

const FRACTIONS = /^[½¼¾⅓⅔⅛⅜⅝⅞]+$/
const NUMBER = /^\d+([.,/x-]\d+)*$/i

export function ingredientName(line: string): string {
  // Drop any parenthetical (e.g. "(1 c. à soupe)") and squash whitespace.
  const cleaned = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return line.trim()

  const toks = cleaned.split(' ')
  // The first token that's a real word (not a number, unit, or connector).
  let firstContent = -1
  for (let j = 0; j < toks.length; j++) {
    const bare = toks[j].toLowerCase().replace(/[.,;]+$/, '')
    const isQty = NUMBER.test(bare) || FRACTIONS.test(toks[j])
    if (!(isQty || UNITS.has(bare) || CONNECT.has(bare))) {
      firstContent = j
      break
    }
  }

  // firstContent === -1: the line is only measurements ("500 g") — leave as-is.
  // firstContent === 0: no leading measurement run — leave as-is.
  let name = firstContent > 0 ? toks.slice(firstContent).join(' ').trim() : cleaned
  // A leftover leading connector ("d'oignon", "de farine").
  name = name.replace(/^d['’]\s*/i, '').replace(/^(de|du|des|of|à|au|aux)\s+/i, '').trim()
  if (!name) name = cleaned
  return name.charAt(0).toUpperCase() + name.slice(1)
}
