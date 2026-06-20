import { useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { MultiCookMode } from '../components/MultiCookMode'
import { Loading } from '../components/Fallback'
import { useCookableMeals } from '../lib/nextMeal'
import { type Recipe } from '../lib/recipes'
import { useMeals, useRecipes } from '../lib/queryHooks'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// /kitchen/cook/multi — cook several of today's planned dishes at once (#43). The
// set is today's cookable meals (a planned meal that resolves to a saved recipe),
// deduped to distinct recipes. Needs 2+ to be worth a coordinated view; with fewer
// it slips to the kitchen (also guards a cold deep-link). Closing returns to the
// kitchen.
export function MultiCookPage() {
  const close = useSceneClose('/kitchen')
  useEscapeKey(close)
  // Share the meals + recipes caches the picker uses; gate the loading state on them.
  const mealsQ = useMeals()
  const recipesQ = useRecipes()
  const cookable = useCookableMeals()
  // Distinct recipes, in the cookable (slot) order — two slots planning the same
  // dish shouldn't open it twice.
  const recipes = useMemo(() => {
    const seen = new Set<string>()
    const out: Recipe[] = []
    for (const c of cookable) {
      if (seen.has(c.recipe.id)) continue
      seen.add(c.recipe.id)
      out.push(c.recipe)
    }
    return out
  }, [cookable])

  if (!mealsQ.data || !recipesQ.data) return mealsQ.isLoading || recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />
  if (recipes.length < 2) return <Navigate to="/kitchen" replace />
  return <MultiCookMode recipes={recipes} onClose={close} />
}
