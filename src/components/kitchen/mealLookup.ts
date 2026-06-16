import { useMemo } from 'react'
import { type Recipe } from '../../lib/recipes'
import { type MealRow } from './types'

// Match a planned meal to its saved recipe so a day's meal can open its recipe.
// The exact link (recipe_id) is preferred — it survives renames/duplicates; a
// loose title match is the fallback for plain free-text meals and pre-link rows.
// Shared by the Kitchen grid (KidKitchen / the read glance) and the day editor
// (DayPlanPage), so both resolve a meal's recipe the same way.
export function useRecipeForMeal(recipes: Recipe[]) {
  return useMemo(() => {
    const byId = new Map<string, Recipe>()
    const byTitle = new Map<string, Recipe>()
    for (const r of recipes) {
      byId.set(r.id, r)
      byTitle.set(r.title.trim().toLowerCase(), r)
    }
    return (meal: MealRow): Recipe | undefined =>
      (meal.recipe_id ? byId.get(meal.recipe_id) : undefined) ?? byTitle.get(meal.title.trim().toLowerCase())
  }, [recipes])
}
