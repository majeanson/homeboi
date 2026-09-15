import { badRequest, notFound, ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { parseOriginal } from '../_lib/recipeWire'

// ONE recipe's as-imported snapshot (migration 0020) — what the import produced,
// untouched, for the sheet's « Original » toggle.
//
//   GET /api/recipe-original?id=<recipeId> -> { original: RecipeOriginal | null }
//
// It has its own endpoint because it does NOT belong in the recipe list. That list
// is the app's most shared read (nine `useRecipes()` call sites, `...live`,
// persisted to IndexedDB before first paint) and the snapshot holds a full second
// copy of every recipe's text — so shipping it there taxed every surface, every
// poll and every cold boot to serve one toggle nobody had opened yet. See the
// header of `_lib/recipeWire.ts`.
//
// A companion endpoint per concern, like recipe-draft / recipe-to-list / recipe-tags.
// Read-only: the snapshot is WRITTEN by the recipe POST/PATCH (which preserves it
// when an edit doesn't carry one), never here.
export const onRequestGet = authed(async (ctx, actor) => {
  const id = new URL(ctx.request.url).searchParams.get('id')?.trim()
  if (!id) return badRequest('id requis.')

  const row = await ctx.env.DB.prepare('SELECT original_json FROM recipes WHERE id = ? AND household_id = ?')
    .bind(id, actor.householdId)
    .first<{ original_json: string | null }>()
  // 404 for a recipe this household does not have — distinct from a recipe that
  // simply has no snapshot (hand-typed), which is a valid `null`.
  if (!row) return notFound('Recette introuvable.')

  return ok({ original: parseOriginal(row.original_json) })
})
