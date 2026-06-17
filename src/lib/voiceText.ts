// Normalize ONE spoken list item before it lands on the list.
//
// The continuous voice path (La liste, garde-manger) adds each finished phrase
// VERBATIM — it never goes through the AI capture router — so "j'aimerais avoir
// des œufs" would otherwise become a literal list item. We strip the lead-in
// people say before naming a thing ("j'aimerais avoir", "ajoute", "il me faut")
// and the article that follows ("des", "du", "de la"), trim stray punctuation,
// then capitalize — so the list reads "Œufs", "Lait", "Pain". List-collection
// mode only (the hook gates this on `opts.split`); a general capture keeps its
// words for the router. Returns '' when nothing usable is left.

// Lead-in verbs/pronouns, FR-CA + EN, stripped from the START only (so a real
// multi-word item like "pâté chinois" keeps its words). Each phrase must be
// followed by whitespace OR end-of-string, so "j'aimerais avoir" with no item
// strips to nothing; the outer `+` eats a stacked lead-in ("peux-tu ajouter…").
// "mets" (imperative "put") is intentionally absent — it collides with the noun
// *mets* ("dish", as in "mets chinois").
const LEAD_IN =
  /^(?:(?:s'?il (?:te|vous) pla[iî]t|est-ce que tu peux|peux-tu|pourrais-tu|il (?:me|nous) faut|faut(?:-il)?|j'?aimerais(?: avoir)?|j'?aurais besoin(?: de| d')?|je voudrais|je veux|on (?:a besoin|manque)(?: de| d')?|note[rz]?|ajoute[rsz]?|rajoute[rsz]?|mettre|prends|ach[èe]te[rz]?|can you add|could you add|please add|i'?d like|i need|i want|we need|add|buy|get)(?:\s+|$))+/i

// Leading article / partitive dropped once the verb is gone ("du lait" → "lait").
const LEAD_ARTICLE = /^(?:des |du |de la |de l['’]|de |d['’]|le |la |les |un |une |the |an |a |some |of )/i

export function cleanSpokenItem(text: string): string {
  // Strip surrounding quotes/brackets and trailing sentence punctuation.
  let s = text
    .trim()
    .replace(/^["'«»“”\s]+/, '')
    .replace(/["'«»“”.,!?;:\s]+$/, '')
    .trim()
  if (!s) return ''
  s = s.replace(LEAD_IN, '')
  // Twice: handles a residual article after the verb, and stacked "de la" forms.
  s = s.replace(LEAD_ARTICLE, '').replace(LEAD_ARTICLE, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
