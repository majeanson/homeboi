import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { CookMode } from '../components/CookMode'
import { Loading } from '../components/Fallback'
import { scaleIngredients } from '../lib/scale'
import { useRecipes } from '../lib/queryHooks'
import { useSceneClose } from '../lib/sceneNav'

// /kitchen/recipe/:id/cook — full-screen cook mode as a route (was stacked over
// the recipe modal). The batch factor rides in ?x= so the cook screen scales to
// the same amounts the recipe view showed. Closing returns to the recipe.
export function CookPage() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const close = useSceneClose(`/kitchen/recipe/${id}`)
  const recipesQ = useRecipes()

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
