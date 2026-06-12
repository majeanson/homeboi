// Match a recipe's ingredients to the step that uses them, so each step (in cook
// mode and the recipe sheet) can show "what you need right now" with its quantity,
// instead of making you flip back to the full list. Heuristic + offline (no AI):
// an ingredient belongs to a step when a significant word of its cleaned name
// appears in the step text. Forgiving — an ingredient that matches no step (salt,
// a garnish "to taste") simply isn't pinned to one; nothing is lost.
import { ingredientName } from './ingredient'
import { isSectionHeading } from './recipeSections'

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

// The significant words of an ingredient's buyable name (≥3 chars, deduped) — the
// tokens we look for in a step. "Bœuf haché" → ['boeuf','hache']; quantities and
// units are already stripped by ingredientName, so no "g"/"de"/"1" noise tokens.
function nameTokens(ingredientLine: string): string[] {
  const name = ingredientName(ingredientLine) || ingredientLine
  return [...new Set(norm(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3))]
}

// The ingredient lines (original text, WITH quantities) a step uses. Pass the
// already-scaled lines so the shown quantity reflects the current serving size.
export function ingredientsForStep(step: string, ingredients: string[]): string[] {
  const s = norm(step)
  // Section markers aren't ingredients — and "## Glaçage" would otherwise match
  // every step that mentions the glaze.
  return ingredients.filter((ing) => {
    if (isSectionHeading(ing)) return false
    const toks = nameTokens(ing)
    return toks.length > 0 && toks.some((tok) => s.includes(tok))
  })
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
