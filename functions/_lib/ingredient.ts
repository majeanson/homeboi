// Strip a recipe ingredient LINE down to the buyable item NAME — for the grocery
// list (you buy "beurre non salé", not "15 ml de"…) and for flyer search (a clean
// word like "œufs" finds far more deals than "2 œufs"). Display-friendly: keeps
// the original casing/accents of the item, just drops the leading quantity, unit,
// parenthetical, and connector run, then capitalizes the first letter.
//
//   "15 ml (1 c. à soupe) de beurre non salé" -> "Beurre non salé"
//   "1 c. à soupe d'huile d'olive"             -> "Huile d'olive"
//   "2 œufs"                                   -> "Œufs"
//   "400 g de pâtes"                           -> "Pâtes"
//   "1 1/2 tasse de farine tout usage"         -> "Farine tout usage"
//   "Sel et poivre"                            -> "Sel et poivre"  (no qty → as-is)
//
// Deliberately conservative: it only strips a LEADING measurement run, so a real
// ingredient word is never mistaken for a unit (e.g. "1 boîte de soupe" keeps
// "Soupe" — "soupe" is only eaten as part of the spoon phrase "c. à soupe").
//
// Client mirror lives at src/lib/ingredient.ts — the two trees don't share code;
// keep them byte-identical.

// Single-token units / containers that follow a quantity.
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
  // Drop any parenthetical (e.g. "(1 c. à soupe)") and squash whitespace.
  const cleaned = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return line.trim()

  const toks = cleaned.split(' ')
  // Walk the leading measurement run (quantities, units, the spoon phrase, and
  // connectors); stop at the first real word.
  let j = 0
  while (j < toks.length) {
    const bare = bareOf(toks[j])
    // Multi-word spoon tool: stub + "à" + suffix → consume all three.
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

  // j === 0: no leading measurement run → keep the line. j === toks.length: the
  // line is only measurements ("500 g") → the !name guard keeps it.
  let name = j > 0 ? toks.slice(j).join(' ').trim() : cleaned
  // A leftover leading connector ("d'oignon", "de farine").
  name = name.replace(/^d['’]\s*/i, '').replace(/^(de|du|des|of|à|au|aux)\s+/i, '').trim()
  if (!name) name = cleaned
  return name.charAt(0).toUpperCase() + name.slice(1)
}
