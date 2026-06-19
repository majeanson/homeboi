import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { RECIPES_KEY, type Recipe } from '../../lib/recipes'
import { type MealLink } from '../../lib/nextMeal'

// Match a planned meal to its saved recipe so a day's meal can open its recipe.
// The exact link (recipe_id) is preferred — it survives renames/duplicates; a
// loose title match is the fallback for plain free-text meals and pre-link rows
// (the canonical recipeForMeal matcher in lib/nextMeal).
//
// THE one meal→recipe resolver hook for the whole app — pass `recipes` when you
// already hold them (the Kitchen grid + day editor load the list anyway); omit
// them and it reads the shared RECIPES_KEY cache itself, so a surface that has no
// recipes loaded (the board's detail peek) can resolve too without an extra poll.
export function useRecipeForMeal(recipes?: Recipe[]): (m: MealLink) => Recipe | undefined {
  const { data } = useQuery({
    queryKey: RECIPES_KEY,
    queryFn: () => api<{ recipes: Recipe[] }>('recipes'),
    enabled: recipes === undefined,
  })
  const list = recipes ?? data?.recipes ?? []
  return useMemo(() => {
    const byId = new Map<string, Recipe>()
    const byTitle = new Map<string, Recipe>()
    for (const r of list) {
      byId.set(r.id, r)
      byTitle.set(r.title.trim().toLowerCase(), r)
    }
    return (meal: MealLink): Recipe | undefined =>
      (meal.recipe_id ? byId.get(meal.recipe_id) : undefined) ?? byTitle.get(meal.title.trim().toLowerCase())
  }, [list])
}
