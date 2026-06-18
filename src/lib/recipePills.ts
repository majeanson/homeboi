import { type Recipe, recipeTotalMin } from './recipes'
import { withoutHeadings } from './recipeSections'

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

export const PILL_BUILTINS = ['cookable', 'useSoon', 'fast', 'neglected', 'favorites', 'recent'] as const
export type BuiltinKey = (typeof PILL_BUILTINS)[number]

// Sorts are mutually exclusive (one orders the grid); filters stack (AND).
export const SORT_KEYS: readonly BuiltinKey[] = ['cookable', 'useSoon', 'neglected', 'recent']
export const isSortKey = (k: string): boolean => (SORT_KEYS as readonly string[]).includes(k)

// Numeric recipe attributes a custom rule can test. `ingredients` counts real
// lines (skips "## Section" headings); the rest are the recipe's own minutes/yield.
export const NUM_FIELDS = ['totalMin', 'prepMin', 'cookMin', 'ingredients', 'servings'] as const
export type NumField = (typeof NUM_FIELDS)[number]
export type Op = 'lte' | 'gte'

export type Criterion =
  | { field: NumField; op: Op; n: number }
  | { field: 'tag'; tag: string }
  | { field: 'favorite' }
  | { field: 'photo' }
export type CriterionField = Criterion['field']
export type NumCriterion = { field: NumField; op: Op; n: number }
export const isNumField = (f: string): f is NumField => (NUM_FIELDS as readonly string[]).includes(f)
// Narrowing guard so the editor can spread a numeric criterion (op/n) type-safely.
export const isNumCriterion = (c: Criterion): c is NumCriterion => isNumField(c.field)

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
export function numFieldValue(r: Recipe, f: NumField): number | null {
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
  if (c.field === 'tag') return (r.tags ?? []).some((tg) => tg.toLowerCase() === c.tag.toLowerCase())
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
