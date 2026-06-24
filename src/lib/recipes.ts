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
  // The R2 key of the photo this recipe was READ from (the cookbook page /
  // handwritten card), kept so the cook can re-check the card against the parsed
  // text months later (the sheet's "Original" view renders it). Only set for the
  // photo-import path; null/undefined for URL/paste imports or when R2 is unbound.
  sourceImage?: string | null
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
  // Per-step photo R2 keys (feature #17 B), PARALLEL to steps: stepImages[i] is
  // the key for steps[i], or '' when that step has no photo. Optional: older
  // payloads/fixtures predate it. Resolve a non-empty key via imgUrl() (it's
  // always an upload, never a remote URL). Heading rows carry an empty slot.
  stepImages?: string[]
  // The recipe's own reading language for read-aloud ('fr' | 'en'), null/undefined
  // = follow the UI language (the default). An English recipe in a French app reads
  // its steps with an English voice when one is installed. Not a translation.
  lang?: 'fr' | 'en' | null
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
  // The recipe-tab pill config (migration 0045): built-in pills (shown/hidden +
  // order) plus operator-defined custom pills. See lib/recipePills.ts.
  pills?: import('./recipePills').Pill[]
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

// Sort a list of tags by the household's curated order (the preset pill list, or
// `tagOptions(...)` which folds in the built-in starters) — tags present in the
// order list come first in that order; any leftover (an ad-hoc tag never added to
// the pills) keeps its incoming relative order, appended after. Case-insensitive.
// Drives the recipe book's tag chips AND the #11 collection sections, so reordering
// the pills in Réglages reorders the collections.
export function orderTags(tags: string[], order: string[]): string[] {
  const idx = new Map(order.map((tg, i) => [tg.toLowerCase(), i]))
  // Stable sort: leftovers (both Infinity) keep their original order.
  return tags
    .map((tg, i) => ({ tg, i }))
    .sort((a, b) => (idx.get(a.tg.toLowerCase()) ?? Infinity) - (idx.get(b.tg.toLowerCase()) ?? Infinity) || a.i - b.i)
    .map((x) => x.tg)
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
