import { Navigate, useParams } from 'react-router-dom'
import { RecipeForm } from '../components/RecipeForm'
import { Loading } from '../components/Fallback'
import { isGuest } from '../lib/device'
import { useRecipes } from '../lib/queryHooks'
import { useSceneClose } from '../lib/sceneNav'

// /kitchen/recipe/new and /kitchen/recipe/:id/edit — the recipe builder as a
// full-screen route. No :id ⇒ a blank create form; with :id ⇒ prefilled from the
// cache. Save and cancel both leave the scene: a fresh create pops back to the
// kitchen, an edit pops back to that recipe's view (now showing the edits).
export function RecipeFormPage() {
  const { id } = useParams()
  const close = useSceneClose(id ? `/kitchen/recipe/${id}` : '/kitchen')
  const recipesQ = useRecipes({ enabled: !!id })

  // Read-only guest: the builder is a pure create/edit form — bounce out (also
  // guards a deep link). Placed after the hooks so the hook order is stable.
  if (isGuest()) return <Navigate to={id ? `/kitchen/recipe/${id}` : '/kitchen'} replace />

  if (id) {
    const recipe = recipesQ.data?.recipes.find((r) => r.id === id)
    if (!recipe) return recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />
    return <RecipeForm value={recipe} onSaved={close} onCancel={close} />
  }
  return <RecipeForm value={null} onSaved={close} onCancel={close} />
}
