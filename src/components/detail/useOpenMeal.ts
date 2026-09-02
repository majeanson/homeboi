import { useEntityDetail } from './DetailProvider'
import { buildMeal, type DetailCtx, type MealLike, type MealOpts } from './adapters'

// The ONE answer to "a planned meal was tapped, now what?" — shared by every surface
// that lists meals (the board heroes + rows, the month grid) so they can never disagree.
//
// EVERY tapped meal opens the peek (Marc, 2026-09-02). It used to split: a meal that
// resolved a recipe went STRAIGHT to /kitchen/recipe/:id under "tap the thing, get the
// thing", and only a free-text meal peeked. That split cost the thing a plan is FOR —
// the recipe view knows nothing about the day, so from a planned supper there was no
// way back to the day it belongs to, and no « Voir la journée » anywhere on the path.
// The peek is the only surface that holds both halves, so it now carries the day door,
// « Ouvrir la recette » and a primary « Cuisiner » together.
//
// This is deliberately NOT the "menu-peek" the codebase deleted elsewhere: it does not
// merely list ways to reach another page — it carries the PLAN (which day, which slot,
// who cooks, restants, retirer du plan), which neither the recipe view nor the day page
// shows. Accepted cost, chosen with eyes open: cooking tonight from the board's « Ce
// soir » hero is 2 taps instead of 1 (tap-budget.spec.ts re-pinned to 2).
//
// Recipe resolution order matters:
//   1. the RESOLVED recipe (useRecipeForMeal → by recipe_id, else by exact title), so a
//      meal whose stored link went stale still offers the recipe its title names;
//   2. failing that, the raw `recipe_id` — a meal can be tapped before RECIPES_KEY has
//      loaded, and the doors must not appear or vanish with cache warmth.
// Neither → a free-text meal ("Restes de poulet"): the peek opens without recipe doors.
export function useOpenMeal(ctx: DetailCtx): (m: MealLike, opts?: MealOpts) => void {
  const detail = useEntityDetail()
  return (m, opts) => {
    const recipeId = ctx.recipeFor?.(m)?.id ?? m.recipe_id ?? null
    detail.open(buildMeal(m, ctx, { ...opts, recipeId }))
  }
}
