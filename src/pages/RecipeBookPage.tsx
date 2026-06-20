import { Navigate, useNavigate } from 'react-router-dom'
import { ToddlerCookBook } from '../components/kitchen/ToddlerCookBook'
import { Loading } from '../components/Fallback'
import { useRecipes } from '../lib/queryHooks'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// /kitchen/book — the picture cookbook (#45). It is ALWAYS the toddler-facing,
// read-aloud, swipeable game — NEVER a printable. The same on-screen book the kid
// kitchen opens, here as a full-screen scene (entered from the kitchen ＋ ▸ book),
// so a grown-up can open it too. Closing returns to the kitchen; tapping a page's
// "On cuisine !" starts that recipe's cook mode.
export function RecipeBookPage() {
  const nav = useNavigate()
  const close = useSceneClose('/kitchen')
  useEscapeKey(close)
  const recipesQ = useRecipes()

  if (!recipesQ.data) return recipesQ.isLoading ? <Loading /> : <Navigate to="/kitchen" replace />
  return (
    <div className="scene kidbook-scene">
      <ToddlerCookBook
        recipes={recipesQ.data.recipes}
        onCook={(r) => nav(`/kitchen/recipe/${r.id}/cook`)}
        onBack={close}
      />
    </div>
  )
}
