import { imgUrl } from './image'

// Shared recipe types + helpers for the recipe-book UI. Mirrors the shape the
// /api/recipes endpoint returns (see functions/api/recipes.ts).
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
  updatedAt: number
}

export const RECIPES_KEY = ['recipes']

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
