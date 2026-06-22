import { useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { MultiCookMode } from '../components/MultiCookMode'
import { Loading } from '../components/Fallback'
import { useCookableMeals } from '../lib/nextMeal'
import { type Recipe } from '../lib/recipes'
import { useMeals, useRecipes } from '../lib/queryHooks'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// /kitchen/cook/multi — cook several dishes at once (#43). The set comes from the ＋
// "Cuisiner ensemble" picker as `?r=id,id,…` (the dishes you ticked, in pick order).
// With no `r` it falls back to all of today's cookable meals (deduped) — a cold
// deep-link / back-compat path. Needs 2+ recipes to be worth a coordinated view;
// fewer slips to the kitchen. Closing returns to the kitchen.
export function MultiCookPage() {
  const close = useSceneClose('/kitchen')
  useEscapeKey(close)
  const [params] = useSearchParams()
  const pickIds = params.get('r')
  // Share the meals + recipes caches the picker uses; gate the loading state on them.
  const mealsQ = useMeals()
  const recipesQ = useRecipes()
  const cookable = useCookableMeals()
  // The chosen dishes: when `?r=` is present, the ticked recipes IN THAT ORDER
  // (skipping any that no longer exist); otherwise today's cookable meals, deduped
  // to distinct recipes in slot order — two slots planning the same dish open once.
  const recipes = useMemo(() => {
    const all = recipesQ.data?.recipes ?? []
    if (pickIds !== null) {
      return pickIds
        .split(',')
        .map((id) => all.find((r) => r.id === id))
        .filter((r): r is Recipe => !!r)
    }
    const seen = new Set<string>()
    const out: Recipe[] = []
    for (const c of cookable) {
      if (seen.has(c.recipe.id)) continue
      seen.add(c.recipe.id)
      out.push(c.recipe)
    }
    return out
  }, [pickIds, recipesQ.data, cookable])

  if (!mealsQ.data || !recipesQ.data) return mealsQ.isLoading || recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />
  if (recipes.length < 2) return <Navigate to="/kitchen" replace />
  return <MultiCookMode recipes={recipes} onClose={close} />
}
