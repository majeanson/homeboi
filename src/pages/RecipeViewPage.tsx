import { useNavigate, useParams } from 'react-router-dom'
import { StaleBounce } from '../components/StaleBounce'
import { RecipeSheet } from '../components/RecipeSheet'
import { Loading } from '../components/Fallback'
import { useLang, useT } from '../i18n'
import { useWeekLabeled } from '../components/kitchen/week'
import { WINDOW_DAYS_DEFAULT } from '../lib/mealSlots'
import { useRecipes, useMeals } from '../lib/queryHooks'
import { useSceneClose } from '../lib/sceneNav'

// /kitchen/recipe/:id — read a recipe (full-screen route, was a centered modal
// over the kitchen). Recipe + the plan-a-supper week both come from the shared
// caches, so a deep link / reload rebuilds them. Cook + Edit are sibling routes.
export function RecipeViewPage() {
  const t = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const { lang } = useLang()
  const close = useSceneClose('/kitchen')
  const recipesQ = useRecipes()
  const mealsQ = useMeals()

  const recipe = recipesQ.data?.recipes.find((r) => r.id === id)
  const weekStart = mealsQ.data?.weekStart ?? 0
  // The ONE window builder (components/kitchen/week.ts) — this used to re-implement
  // it inline, which is how a "one place that builds it" comment came to be untrue.
  const labeled = useWeekLabeled(weekStart, mealsQ.data?.windowDays ?? WINDOW_DAYS_DEFAULT, lang)
  const week = weekStart ? labeled : []

  if (!recipe)
    return recipesQ.isLoading ? <Loading /> : <StaleBounce to="/kitchen" message={t.kitchen.recipeGone} />
  return (
    <RecipeSheet
      recipe={recipe}
      week={week}
      onCook={(factor) => nav(`/kitchen/recipe/${recipe.id}/cook${factor !== 1 ? `?x=${factor}` : ''}`)}
      onEdit={() => nav(`/kitchen/recipe/${recipe.id}/edit`)}
      onClose={close}
    />
  )
}
