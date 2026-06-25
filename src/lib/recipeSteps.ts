// Match a recipe's ingredients to the step that uses them, so each step (in cook
// mode and the recipe sheet) can show "what you need right now" with its quantity,
// instead of making you flip back to the full list. Heuristic + offline (no AI):
// an ingredient belongs to a step when a significant WORD of its cleaned name
// appears as a WORD in the step text. Forgiving — an ingredient that matches no
// step (salt, a garnish "to taste") simply isn't pinned to one; nothing is lost.
//
// The match is whole-word (with a light plural fold), NOT a raw substring: an
// earlier substring test mis-fired inside longer words — "ail" (garlic) lit up on
// "t**ail**ler", "lait" on "lait­ue", "sel" on "vais**sel**le" — so an ingredient
// kept showing on steps that never used it (the "ingredient on a random step" bug).
import { ingredientName } from './ingredient'
import { groupSections, isSectionHeading } from './recipeSections'

// Accent-insensitive, lowercase, with the French ligatures expanded (œ→oe, æ→ae)
// so "bœuf" tokenizes to "boeuf" and matches a step that also writes "bœuf" —
// otherwise the ligature splits the word into unusable fragments.
const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')

// Fold a French plural to its stem so "oignon" matches "oignons" and "tomates"
// matches "tomate": drop a single trailing 's'/'x' on words long enough that doing
// so can't collapse two unrelated short words ("ail", "sel" stay whole). Stripping
// only the regular plural marker — never an "-es" cluster — keeps "tomate" and
// "tomates" landing on the same stem without dragging "lait" onto "laitue".
const stem = (w: string): string => (w.length > 3 ? w.replace(/[sx]$/, '') : w)

// The significant words of an ingredient's buyable name (≥3 chars, deduped, plural-
// folded) — the tokens we look for in a step. "Bœuf haché" → ['boeuf','hache'];
// quantities and units are already stripped by ingredientName, so no "g"/"de"/"1"
// noise tokens.
function nameTokens(ingredientLine: string): string[] {
  const name = ingredientName(ingredientLine) || ingredientLine
  return [...new Set(norm(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(stem))]
}

// The words of a step, plural-folded into a lookup set, so an ingredient token
// matches only a whole word (not a fragment inside a longer one).
function stepWordSet(step: string): Set<string> {
  return new Set(norm(step).split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(stem))
}

// The ingredient lines (original text, WITH quantities) a step uses. Pass the
// already-scaled lines so the shown quantity reflects the current serving size.
// When the step belongs to a named section AND the ingredient list has a
// matching section, only that section's lines are candidates — the glaze step
// shows the glaze's sugar, not the cookie's. No matching section (or none at
// all) falls back to the whole list.
export function ingredientsForStep(step: string, ingredients: string[], section?: string | null): string[] {
  let pool = ingredients
  if (section) {
    const want = norm(section)
    const match = groupSections(ingredients).find((g) => {
      if (!g.title) return false
      const have = norm(g.title)
      // Containment either way: "Pour le glaçage" ↔ "Glaçage".
      return have === want || have.includes(want) || want.includes(have)
    })
    if (match) pool = match.items.map((it) => it.text)
  }
  const words = stepWordSet(step)
  // Section markers aren't ingredients — and "## Glaçage" would otherwise match
  // every step that mentions the glaze.
  return pool.filter((ing) => {
    if (isSectionHeading(ing)) return false
    const toks = nameTokens(ing)
    return toks.length > 0 && toks.some((tok) => words.has(tok))
  })
}

// Drop a leading ordinal that just repeats the step's OWN number — the list
// already renders "5." in front of step 5, so a step whose text ALSO starts with
// "5" is a doubled marker the import didn't strip. Conservative: it removes the
// number only when it EXACTLY equals the step position `n` AND reads as a marker
// (trailing ./)/:/– punctuation, or a Capitalised word right after it) — so a real
// quantity that happens to lead the step ("5 minutes au four" as step 5) is kept.
export function stripStepOrdinal(text: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) return text
  // ^<n> then EITHER marker punctuation (+ surrounding space) OR a space and a
  // capital letter. The digit can't be followed by another digit, so "15 …" as
  // step 1 never loses its "1".
  const re = new RegExp(`^\\s*${n}(?:\\s*[.):\\-–—]\\s*|\\s+(?=[A-ZÀ-ÖØ-Þ]))`)
  const m = text.match(re)
  if (!m) return text
  const rest = text.slice(m[0].length)
  return rest.length ? rest : text
}

// Split a step into its sentences so a multi-sentence instruction reads as bullet
// points ("do this. then that." → two bullets). Splits only after end punctuation
// FOLLOWED by whitespace, so a decimal like "1.5 h" is never split. Always returns
// at least the whole step.
export function stepSentences(step: string): string[] {
  const parts = step
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : [step.trim()]
}
