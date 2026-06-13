import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RecipeSheet } from '../components/RecipeSheet'
import { Loading } from '../components/Fallback'
import { useLang } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { formatWeekday } from '../lib/format'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { type MealsData, MEALS_KEY } from '../components/kitchen/types'
import { useSceneClose } from '../lib/sceneNav'

// /kitchen/recipe/:id — read a recipe (full-screen route, was a centered modal
// over the kitchen). Recipe + the plan-a-supper week both come from the shared
// caches, so a deep link / reload rebuilds them. Cook + Edit are sibling routes.
export function RecipeViewPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { lang } = useLang()
  const close = useSceneClose('/kitchen')
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })
  const mealsQ = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })

  const recipe = recipesQ.data?.recipes.find((r) => r.id === id)
  const weekStart = mealsQ.data?.weekStart ?? 0
  const windowDays = mealsQ.data?.windowDays ?? 10
  const week = weekStart
    ? Array.from({ length: windowDays }, (_, i) => {
        const date = weekStart + i * 86400
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
