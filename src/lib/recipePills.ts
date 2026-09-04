import { type Recipe, recipeTotalMin } from './recipes'
import { withoutHeadings } from './recipeSections'
import { type MealSlot } from './mealSlots'

// Customizable recipe-tab pills (the chips above the recipe grid). Two kinds:
//   · BUILT-IN pills — the stock-aware sorts ("Quoi cuisiner?", "À utiliser",
//     "Oubliées"), the ≤30-min filter, "Favoris" (loved) and "Récemment ajoutées".
//     Each can be hidden + reordered, but its behaviour is fixed.
//   · CUSTOM pills — operator-defined: a label + colour + a set of attribute RULES
//     (AND-ed). A pill is a calm, one-tap filter — e.g. "Soupers rapides" = tag
//     Souper AND total ≤ 30 min, or "Gros lots" = ≥ 10 ingredients.
//
// The order is a single household setting (recipe_pills_json, migration 0045),
// read with the recipe-tags GET and edited in Réglages ▸ Recettes. The recipe book
// renders exactly the shown pills, in this order; everything degrades gracefully
// (a pill whose data is absent — no low items, no favourites — simply doesn't show).

const PILL_BUILTINS = ['cookable', 'useSoon', 'fast', 'neglected', 'favorites', 'recent'] as const
export type BuiltinKey = (typeof PILL_BUILTINS)[number]

// Sorts are mutually exclusive (one orders the grid); filters stack (AND).
const SORT_KEYS: readonly BuiltinKey[] = ['cookable', 'useSoon', 'neglected', 'recent']
export const isSortKey = (k: string): boolean => (SORT_KEYS as readonly string[]).includes(k)

// Numeric recipe attributes a custom rule can test. `ingredients` counts real
// lines (skips "## Section" headings); the rest are the recipe's own minutes/yield.
export const NUM_FIELDS = ['totalMin', 'prepMin', 'cookMin', 'ingredients', 'servings'] as const
export type NumField = (typeof NUM_FIELDS)[number]
type Op = 'lte' | 'gte'

export type Criterion =
  | { field: NumField; op: Op; n: number }
  // A tag rule matches a recipe carrying ANY of its tags (OR within the rule); a
  // pill's rules still AND across each other. So "Souper végé rapide" = tag in
  // {Végé, Végan} AND total ≤ 30 min, built as two rules.
  | { field: 'tag'; tags: string[] }
  | { field: 'favorite' }
  | { field: 'photo' }
export type CriterionField = Criterion['field']
export type NumCriterion = { field: NumField; op: Op; n: number }
const isNumField = (f: string): f is NumField => (NUM_FIELDS as readonly string[]).includes(f)
// Narrowing guard so the editor can spread a numeric criterion (op/n) type-safely.
export const isNumCriterion = (c: Criterion): c is NumCriterion => isNumField(c.field)

// The tags a tag-rule tests (OR-ed). Tolerant of the LEGACY single-tag shape
// `{tag:'x'}` saved before multi-tag, so old pills keep matching without a migration.
export function critTags(c: Criterion): string[] {
  if (c.field !== 'tag') return []
  const raw = c as { tags?: unknown; tag?: unknown }
  if (Array.isArray(raw.tags)) return raw.tags.filter((x): x is string => typeof x === 'string' && x.length > 0)
  if (typeof raw.tag === 'string' && raw.tag) return [raw.tag]
  return []
}

export interface BuiltinPill {
  k: BuiltinKey
  off?: boolean
}
export interface CustomPill {
  id: string
  label: string
  color?: string
  off?: boolean
  rules: Criterion[]
  // Meal slots this pill should be PRIORITIZED for when planning a meal (the day
  // editor's slot picker, the week grid's quick-add) — e.g. a "Dîner & Souper" pill
  // lifts its matching recipes above the rest of the book (never above Restants,
  // which always lead — see mealPickOptions). Absent/empty = no slot priority; the
  // pill still works as an ordinary recipe-tab filter/sort.
  slots?: MealSlot[]
}
export type Pill = BuiltinPill | CustomPill

export const isBuiltinPill = (p: Pill): p is BuiltinPill => 'k' in p
export const pillKey = (p: Pill): string => (isBuiltinPill(p) ? p.k : p.id)

// The default pill set when a household hasn't customized: every built-in, shown,
// in this order. (The recipe-tags endpoint also appends any built-in missing from
// a saved config, so a new built-in pill surfaces for existing households.)
export const DEFAULT_PILLS: Pill[] = PILL_BUILTINS.map((k) => ({ k }))

// A field's value for a recipe, or null when the recipe carries no such data (an
// unknown value never matches — a "≤ 20 min" pill won't surface untimed recipes).
function numFieldValue(r: Recipe, f: NumField): number | null {
  switch (f) {
    case 'totalMin':
      return recipeTotalMin(r)
    case 'prepMin':
      return r.prepMin ?? null
    case 'cookMin':
      return r.cookMin ?? null
    case 'ingredients':
      return withoutHeadings(r.ingredients).length
    case 'servings':
      return r.servings ?? null
  }
}

export function matchesCriterion(r: Recipe, c: Criterion, loved: Set<string>): boolean {
  if (c.field === 'tag') {
    const wanted = critTags(c)
    if (wanted.length === 0) return false // an empty tag rule matches nothing (incomplete)
    const rt = new Set((r.tags ?? []).map((tg) => tg.toLowerCase()))
    return wanted.some((w) => rt.has(w.toLowerCase()))
  }
  if (c.field === 'favorite') return loved.has(r.id)
  if (c.field === 'photo') return !!r.image
  const v = numFieldValue(r, c.field)
  if (v == null) return false
  return c.op === 'gte' ? v >= c.n : v <= c.n
}

// A recipe matches a custom pill when it satisfies EVERY rule (AND). An empty
// rule set matches nothing (the pill is incomplete) — callers hide such pills.
export const matchesCustom = (r: Recipe, p: CustomPill, loved: Set<string>): boolean =>
  p.rules.length > 0 && p.rules.every((c) => matchesCriterion(r, c, loved))

// A recipe→priority test for the given meal slot: matches ANY shown custom pill
// whose `slots` claims that slot. Used by the meal-slot pickers (comboOptions.tsx)
// to lift a household's "Dîner & Souper"-style pills above the rest of the book —
// never above Restants, which always lead regardless of this.
//
// Returns the LIFTING PILL'S OWN LABEL (its first match, if several) rather than a
// bare boolean, so the picker can say WHY a recipe jumped to the top instead of
// reordering silently — a household member who never opened Réglages had no way to
// know. `null` = not lifted; test with `!== null`, never for truthiness: a pill the
// household left unnamed has an empty label and is still a lift.
export function slotPriorityLabel(pills: Pill[], slot: MealSlot, loved: Set<string>): (r: Recipe) => string | null {
  const active = pills.filter(
    (p): p is CustomPill => !isBuiltinPill(p) && !p.off && !!p.slots?.includes(slot),
  )
  if (active.length === 0) return () => null
  return (r) => active.find((p) => matchesCustom(r, p, loved))?.label ?? null
}
