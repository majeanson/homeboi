import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CookMode } from '../components/CookMode'
import { Loading } from '../components/Fallback'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { scaleIngredients } from '../lib/scale'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { useSceneClose } from '../lib/sceneNav'

// /kitchen/recipe/:id/cook — full-screen cook mode as a route (was stacked over
// the recipe modal). The batch factor rides in ?x= so the cook screen scales to
// the same amounts the recipe view showed. Closing returns to the recipe.
export function CookPage() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const close = useSceneClose(`/kitchen/recipe/${id}`)
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })

  const recipe = recipesQ.data?.recipes.find((r) => r.id === id)
  if (!recipe) return recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />

  const factor = Number(sp.get('x')) || 1
  const cookRecipe =
    factor === 1
      ? recipe
      : {
          ...recipe,
          ingredients: scaleIngredients(recipe.ingredients, factor),
          servings: recipe.servings && recipe.servings > 0 ? Math.max(1, Math.round(recipe.servings * factor)) : recipe.servings,
        }
  return <CookMode recipe={cookRecipe} onClose={close} />
}
