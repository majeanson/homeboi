import { parseJsonArray } from './json'
import { healTruncatedSteps } from './recipeImport'
import { normalizeStepImages } from './recipeStepImages'

// THE recipe row → wire mapping, in one place, because the list read is the most
// shared payload in the app and what it carries is a decision, not an accident.
//
// `useRecipes()` has NINE call sites (Kitchen, the book, cook mode, multicook, the
// day plan, ideas, search — even the board's DrawPad), it rides `...live` so it
// re-polls every ~10 s while a kitchen surface is open, it is persisted to
// IndexedDB BEFORE FIRST PAINT (lib/persist), and it replays offline. Every byte
// here is paid on the cold-boot critical path, per household, forever.
//
// Which is why `original` is NOT in it (2026-09-15). The as-imported snapshot
// (migration 0020) holds `ingredients: string[]` + `steps: string[]` — a full
// SECOND COPY of the recipe's text — and exactly two surfaces read it: the sheet's
// « Original » toggle and the edit form's pass-through. So the list shipped roughly
// twice the text it needed, to every surface, forever, to serve one toggle. It is
// fetched per recipe now (`/api/recipe-original`).
//
// The row's `original_json` is still SELECTed and parsed here — `healTruncatedSteps`
// needs it to restore a step chopped by the old 200-char save cap. That heal is the
// reason this mapper is worth testing: the payload shrank and the heal survived.

export interface RecipeRow {
  id: string
  title: string
  ingredients_json: string
  steps_json: string
  servings: number | null
  servings_unit: string | null
  prep_min: number | null
  cook_min: number | null
  total_min: number | null
  notes: string | null
  source: string | null
  image: string | null
  tags_json: string
  original_json: string | null
  steps_images_json: string | null
  lang: string | null
  updated_at: number
}

// The as-imported snapshot (migration 0020): what the import (URL / paste / photo)
// produced, untouched, so the sheet can always show « the original ».
export interface RecipeOriginal {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings?: number | null
  source?: string | null
  importedAt?: number | null
  // R2 key of the photo this recipe was read from (photo-import path), so the
  // « Original » view can show the source card. An R2 key only — never a remote
  // URL — and freed with the row on delete.
  sourceImage?: string | null
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** Parse the stored snapshot back out (defensive — a bad row reads as null). */
export function parseOriginal(json: string | null): RecipeOriginal | null {
  if (!json) return null
  try {
    const o = JSON.parse(json) as RecipeOriginal
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null
  } catch {
    return null
  }
}

// Reading language for read-aloud — only the two the app supports; anything else
// (or unset) reads as null = « follow the UI language ».
const cleanLang = (v: unknown): string | null => (v === 'fr' || v === 'en' ? v : null)

/**
 * One recipe as the LIST read sends it. Everything a card, a cook-mode scene, a
 * search hit or a meal link needs — and nothing that only one toggle needs.
 */
export function recipeListItem(r: RecipeRow) {
  // Self-heal: a step chopped by the OLD 200-char save cap is restored from the full
  // text preserved in the `original` snapshot. This fixes every legacy recipe on
  // load — no destructive backfill — and once the cook re-saves, the full step
  // persists. Step count is unchanged, so the parallel stepImages array still lines
  // up. The snapshot is READ here and deliberately not returned.
  const steps = healTruncatedSteps(parseJsonArray<string>(r.steps_json, isStr), parseOriginal(r.original_json)?.steps)
  return {
    id: r.id,
    title: r.title,
    ingredients: parseJsonArray<string>(r.ingredients_json, isStr),
    steps,
    servings: r.servings,
    servingsUnit: r.servings_unit,
    prepMin: r.prep_min,
    cookMin: r.cook_min,
    totalMin: r.total_min,
    notes: r.notes,
    source: r.source,
    image: r.image,
    tags: parseJsonArray<string>(r.tags_json, isStr),
    // Parallel per-step photo keys, '' = none (feature #17 B). These STAY: cook mode
    // reads them off the list, and a key is a short token, not a copy of the recipe.
    stepImages: normalizeStepImages(r.steps_images_json, steps.length),
    lang: cleanLang(r.lang),
    updatedAt: r.updated_at,
  }
}
