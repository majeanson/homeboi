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
  notes: string | null
  source: string | null
  image: string | null // an R2 key (uploaded) OR an https URL (imported)
  tags: string[]
  original?: RecipeOriginal | null
  updatedAt: number
}

export const RECIPES_KEY = ['recipes']

// /api/recipe-tags — the household tag layer: saved preset pills + every tag
// currently in use (with counts). Shared by the recipe form (pill offer) and
// the Réglages tag manager.
export interface RecipeTagInfo {
  tag: string
  count: number
}
export interface RecipeTagsData {
  presets: string[]
  used: RecipeTagInfo[]
}
export const RECIPE_TAGS_KEY = ['recipeTags']

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
