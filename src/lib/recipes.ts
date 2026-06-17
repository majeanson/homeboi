import { imgUrl } from './image'

// Shared recipe types + helpers for the recipe-book UI. Mirrors the shape the
// /api/recipes endpoint returns (see functions/api/recipes.ts).

// The recipe exactly as it was imported (URL / paste / photo), before any
// edits — the sheet's "Original" view shows this untouched.
export interface RecipeOriginal {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings?: number | null
  source?: string | null
  importedAt?: number | null
}

export interface Recipe {
  id: string
  title: string
  ingredients: string[]
  steps: string[]
  servings: number | null
  // The yield's unit when it isn't plain portions ("24 biscuits"); null = the
  // default "portions" label. Optional: older payloads/fixtures predate it.
  servingsUnit?: string | null
  // Real time fields (whole minutes) — imports fill them, freely editable.
  prepMin?: number | null
  cookMin?: number | null
  totalMin?: number | null
  notes: string | null
  source: string | null
  image: string | null // an R2 key (uploaded) OR an https URL (imported)
  tags: string[]
  original?: RecipeOriginal | null
  updatedAt: number
}

// The shown total: the stated total when present, else prep+cook when either
// exists. Null = the recipe carries no time data at all.
export function recipeTotalMin(r: Pick<Recipe, 'prepMin' | 'cookMin' | 'totalMin'>): number | null {
  if (r.totalMin) return r.totalMin
  const sum = (r.prepMin ?? 0) + (r.cookMin ?? 0)
  return sum > 0 ? sum : null
}

export const RECIPES_KEY = ['recipes']

// /api/recipe-tags — the household tag layer: saved preset pills + every tag
// currently in use (with counts). Shared by the recipe form (pill offer) and
// the Réglages tag manager.
interface RecipeTagInfo {
  tag: string
  count: number
}
export interface RecipeTagsData {
  presets: string[]
  used: RecipeTagInfo[]
  // Per-tag colour overrides, keyed by lowercase tag name → "#rrggbb"
  // (migration 0037). A missing key = the default berry chip colour.
  colors: Record<string, string>
}
export const RECIPE_TAGS_KEY = ['recipeTags']

// A tag's household colour, or undefined when none is set (→ default chip).
// Lowercase lookup, matching how tags are matched everywhere else.
export const tagColor = (colors: Record<string, string> | undefined, tag: string): string | undefined =>
  colors?.[tag.toLowerCase()]

// The pills the recipe form offers: the household's saved presets (or the
// built-in starters when none are saved yet), then every tag already in use —
// so a tag typed once ("Collation") is a one-tap pill from then on.
export function tagOptions(presets: string[], used: string[], defaults: readonly string[]): string[] {
  const out = presets.length ? [...presets] : [...defaults]
  const seen = new Set(out.map((tg) => tg.toLowerCase()))
  for (const tag of used) {
    const key = tag.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(tag)
    }
  }
  return out
}

// Every distinct tag across the book, in first-seen order — drives the Kitchen
// filter chips. Defensive about a recipe whose tags didn't load (older payload).
export function allTags(recipes: Recipe[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of recipes)
    for (const tag of r.tags ?? []) {
      const key = tag.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(tag)
      }
    }
  return out
}

// Resolve a recipe's stored image to a usable src: a full URL passes through (an
// imported picture), anything else is an R2 key served by /api/img/<key>.
export const recipeImg = (image: string | null | undefined): string | null =>
  !image ? null : /^https?:\/\//i.test(image) ? image : imgUrl(image)
