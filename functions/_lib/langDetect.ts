// Guess whether a block of recipe text reads as French or English, for the
// read-aloud language hint (recipes.lang — migration 0060). Returns null when it
// can't tell confidently, so the caller LEAVES the recipe's language unset
// (= follow the UI), which is exactly the "if it can't detect, leave as is" rule.
//
// Heuristic, NOT AI, on purpose:
//   • it runs on EVERY import path — URL JSON-LD, microdata, paste, photo — even
//     the ones that never call a model, so the language is set uniformly.
//   • zero cost / latency (no extra inference) and it works when AI is unbound.
//   • a full recipe is LONG text, where FR vs EN word-frequency separates cleanly.
//     (The short-string misdetection risk that ruled out per-utterance auto-detect
//     — "Lait" vs "Milk" — doesn't apply to a whole card.)
// Only FR vs EN — the two languages the app supports.

// Function words + cooking verbs/nouns that are STRONGLY one language and don't
// collide with a common word in the other (so a stray match can't flip the count).
// Accented letters are handled separately as their own French signal.
const FR_WORDS = new Set([
  'de', 'la', 'le', 'les', 'et', 'à', 'un', 'une', 'des', 'du', 'au', 'aux',
  'pour', 'sur', 'dans', 'avec', 'est', 'sont', 'puis', 'ou', 'jusqu', 'bien',
  'tasse', 'tasses', 'cuillère', 'cuillères', 'soupe', 'thé', 'mélanger',
  'ajouter', 'cuire', 'four', 'sel', 'sucre', 'farine', 'beurre', 'œufs', 'oeufs',
  'lait', 'eau', 'pâte', 'feu', 'mélange', 'remuer', 'verser', 'déposer',
  'laisser', 'environ', 'chaud', 'froid', 'morceaux',
])
const EN_WORDS = new Set([
  'the', 'and', 'with', 'to', 'of', 'for', 'in', 'until', 'then', 'into', 'over',
  'cup', 'cups', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'mix',
  'add', 'bake', 'baking', 'oven', 'preheat', 'salt', 'sugar', 'flour', 'butter',
  'eggs', 'milk', 'water', 'dough', 'heat', 'stir', 'pour', 'combine', 'about',
  'remove', 'cook', 'whisk', 'chopped',
])

const ACCENTS = /[àâäçéèêëîïôöùûü]/g
const WORD = /[a-zàâäçéèêëîïôöùûüœ]+/g

// Returns 'fr' | 'en' when the text leans clearly one way, else null (undecided —
// leave the recipe's lang alone). Conservative by design: a wrong guess would read
// the whole recipe aloud in the wrong voice, so we only commit on a clear margin.
export function detectLang(text: string | null | undefined): 'fr' | 'en' | null {
  if (!text) return null
  const lower = text.toLowerCase()
  const words = lower.match(WORD) || []
  if (words.length < 8) return null // too little text to tell

  let fr = 0
  let en = 0
  for (const w of words) {
    if (FR_WORDS.has(w)) fr++
    if (EN_WORDS.has(w)) en++
  }
  // Each accented letter nudges toward French — English recipe prose has ~none.
  fr += (lower.match(ACCENTS) || []).length

  if (fr + en < 3) return null // basically no signal either way
  // The leader must hold a 2:1 majority AND a real count, or we abstain.
  if (fr >= en * 2 && fr >= 3) return 'fr'
  if (en >= fr * 2 && en >= 3) return 'en'
  return null
}
