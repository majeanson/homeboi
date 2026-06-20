import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { RecipeSheet } from '../components/RecipeSheet'
import { Loading } from '../components/Fallback'
import { useLang } from '../i18n'
import { formatWeekday } from '../lib/format'
import { addLocalDays } from '../lib/localDay'
import { useRecipes, useMeals } from '../lib/queryHooks'
import { useSceneClose } from '../lib/sceneNav'

// /kitchen/recipe/:id — read a recipe (full-screen route, was a centered modal
// over the kitchen). Recipe + the plan-a-supper week both come from the shared
// caches, so a deep link / reload rebuilds them. Cook + Edit are sibling routes.
export function RecipeViewPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { lang } = useLang()
  const close = useSceneClose('/kitchen')
  const recipesQ = useRecipes()
  const mealsQ = useMeals()

  const recipe = recipesQ.data?.recipes.find((r) => r.id === id)
  const weekStart = mealsQ.data?.weekStart ?? 0
  const windowDays = mealsQ.data?.windowDays ?? 10
  const week = weekStart
    ? Array.from({ length: windowDays }, (_, i) => {
        const date = addLocalDays(weekStart, i)
        return { date, label: formatWeekday(date, lang) }
      })
    : []

  if (!recipe) return recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />
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
