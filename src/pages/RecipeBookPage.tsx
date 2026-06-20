import { Navigate } from 'react-router-dom'
import { RecipeBook } from '../components/kitchen/RecipeBook'
import { Loading } from '../components/Fallback'
import { useRecipes } from '../lib/queryHooks'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// /kitchen/book — the printable toddler recipe/activity book (#45) as a full-screen
// scene. Closing returns to the kitchen. The book itself owns the collection filter
// + print; this wrapper just loads the recipes and wires close/Esc.
export function RecipeBookPage() {
  const close = useSceneClose('/kitchen')
  useEscapeKey(close)
  const recipesQ = useRecipes()

  if (!recipesQ.data) return recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />
  return <RecipeBook recipes={recipesQ.data.recipes} onClose={close} />
}
