import { useNavigate } from 'react-router-dom'
import { useEntityDetail } from './DetailProvider'
import { buildMeal, type DetailCtx, type MealLike, type MealOpts } from './adapters'

// The ONE answer to "a planned meal was tapped, now what?" — shared by every surface
// that lists meals (the board heroes + rows, the moments view, the month grid, the day
// page) so they can never disagree.
//
// Tap the thing, get the thing: a meal that resolves a recipe goes STRAIGHT to that
// recipe's view (/kitchen/recipe/:id) — no sheet in between offering « Ouvrir la
// recette » / « Cuisiner », since the view carries both plus the photo, the tags, the
// ingredients and the hearts. A meal with no recipe behind it has nowhere to jump, so
// it opens the peek, where the plan actions (Voir la journée, Créer des restants,
// Retirer du plan) live.
//
// Resolution order matters, and mirrors what buildMeal used to do:
//   1. the RESOLVED recipe (useRecipeForMeal → by recipe_id, else by exact title), so a
//      meal whose stored link went stale still lands on the recipe its title names;
//   2. failing that, the raw `recipe_id` — the board can be tapped before RECIPES_KEY
//      has loaded, and a linked meal must not peek-or-navigate depending on cache warmth.
// Neither → a free-text meal ("Restes de poulet"), and the peek opens.
export function useOpenMeal(ctx: DetailCtx): (m: MealLike, opts?: MealOpts) => void {
  const nav = useNavigate()
  const detail = useEntityDetail()
  return (m, opts) => {
    const recipeId = ctx.recipeFor?.(m)?.id ?? m.recipe_id ?? null
    if (recipeId) nav(`/kitchen/recipe/${recipeId}`)
    else detail.open(buildMeal(m, ctx, opts))
  }
}
