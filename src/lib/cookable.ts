// "Quoi cuisiner ?" — rank the recipe book by what you could cook now. There is
// no full pantry inventory by design (the app only tracks what you're OUT of —
// pantry-low — and what you're about to buy — the list). So an ingredient counts
// as MISSING when it matches a pantry-low item AND isn't already on the list.
// Fewest-missing first. It's a gentle nudge ("you have everything for this"),
// a heuristic, not a guarantee.

// Normalize an ingredient line or a stocked-item label to a comparable key:
// lowercase, fold ligatures/diacritics, drop a leading quantity+unit run, strip
// punctuation. A lean cousin of the server's grocery normalizer — enough to tell
// "400 g de beurre" and "Beurre" are the same thing.
import { withoutHeadings } from './recipeSections'

const DIACRITICS = /[̀-ͯ]/g
const UNITS = [
  'kg', 'g', 'gr', 'mg', 'l', 'ml', 'cl', 'dl',
  'lb', 'lbs', 'oz', 'tasse', 'tasses', 'cup', 'cups', 'tsp', 'tbsp',
  'pincee', 'pincees', 'gousse', 'gousses', 'tranche', 'tranches',
  'boite', 'boites', 'can', 'cans', 'paquet', 'paquets', 'sachet', 'sachets',
  'pot', 'pots', 'bouteille', 'bouteilles', 'contenant', 'contenants',
]
const LEAD_QTY = new RegExp(
  `^\\s*\\d+(?:[.,/]\\d+)?\\s*(?:${UNITS.join('|')})?\\.?\\s*(?:de\\s+|d\\s+|of\\s+)?`,
)

export function normKey(s: string): string {
  const folded = s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return folded
    .replace(LEAD_QTY, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Whole-word containment either way, so "beurre" matches "400 g de beurre" and
// "sauce tomate" matches "1 pot de sauce tomate", but "ail" does NOT match
// "volaille". Keys under 3 chars are too noisy to match on.
function related(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)
}

export interface Ranked<R> {
  recipe: R
  missing: string[]
}

export interface UseSoonRanked<R> {
  recipe: R
  uses: string[]
}

// "Use it up": rank recipes by how many of your use-soon items they'd use —
// MOST first (the inverse of cookability). A gentle "this finishes the spinach
// and the cream" nudge. Recipes that use none drop to the bottom.
export function rankUseSoon<R extends { title: string; ingredients: string[] }>(
  recipes: R[],
  useSoon: string[],
): UseSoonRanked<R>[] {
  const soon = useSoon.map((s) => ({ label: s, key: normKey(s) })).filter((s) => s.key)
  return recipes
    .map((recipe) => {
      const ingKeys = withoutHeadings(recipe.ingredients).map(normKey).filter(Boolean)
      const uses: string[] = []
      for (const s of soon) {
        if (ingKeys.some((ing) => related(ing, s.key))) uses.push(s.label)
      }
      return { recipe, uses }
    })
    .sort((a, b) => b.uses.length - a.uses.length || a.recipe.title.localeCompare(b.recipe.title))
}

export interface NeglectRanked<R> {
  recipe: R
  // Whole days since this recipe was last served, or null when it has no recorded
  // serving in the data we have (never linked to a meal, or older than the window).
  // Null sorts FIRST — "haven't had in a while" leads with the longest-untouched.
  daysSince: number | null
}

// "Haven't had in a while" (PRD): order the book by how long since each recipe was
// last served, most-neglected first. `lastServed` maps a recipe id → the local-
// midnight day-seconds it was last cooked (built from the meals the client holds);
// `todayDay` is today's local-midnight day-seconds. A recipe absent from the map
// has no known serving → daysSince null → sorts to the very top. This is a gentle
// "maybe bring this back" nudge, never a stat or a streak (NFR-CALM): no counts to
// optimise, no shame for a long gap.
export function rankNeglected<R extends { id: string; title: string }>(
  recipes: R[],
  lastServed: Map<string, number>,
  todayDay: number,
): NeglectRanked<R>[] {
  return recipes
    .map((recipe) => {
      const last = lastServed.get(recipe.id)
      const daysSince = last == null ? null : Math.max(0, Math.round((todayDay - last) / 86400))
      return { recipe, daysSince }
    })
    .sort((a, b) => {
      // Never-served (null) leads, then longest gap first; ties break by title so
      // the order is stable, not jittery.
      if (a.daysSince == null && b.daysSince == null) return a.recipe.title.localeCompare(b.recipe.title)
      if (a.daysSince == null) return -1
      if (b.daysSince == null) return 1
      return b.daysSince - a.daysSince || a.recipe.title.localeCompare(b.recipe.title)
    })
}

export function rankCookable<R extends { title: string; ingredients: string[] }>(
  recipes: R[],
  pantryLow: string[],
  listItems: string[],
): Ranked<R>[] {
  const lows = pantryLow.map((l) => ({ label: l, key: normKey(l) })).filter((l) => l.key)
  const listKeys = listItems.map(normKey).filter(Boolean)

  return recipes
    .map((recipe) => {
      const ingKeys = withoutHeadings(recipe.ingredients).map(normKey).filter(Boolean)
      const missing: string[] = []
      for (const low of lows) {
        const needed = ingKeys.some((ing) => related(ing, low.key))
        const onList = listKeys.some((lk) => related(lk, low.key))
        if (needed && !onList) missing.push(low.label)
      }
      return { recipe, missing }
    })
    .sort((a, b) => a.missing.length - b.missing.length || a.recipe.title.localeCompare(b.recipe.title))
}
