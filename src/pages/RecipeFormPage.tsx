import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { StaleBounce } from '../components/StaleBounce'
import { RecipeForm, type AutoImport } from '../components/RecipeForm'
import { Loading } from '../components/Fallback'
import { isGuest } from '../lib/device'
import { useRecipes } from '../lib/queryHooks'
import { useSceneClose } from '../lib/sceneNav'
import { parseRecipeHash } from '../lib/recipeBookmarklet'

// /kitchen/recipe/new and /kitchen/recipe/:id/edit — the recipe builder as a
// full-screen route. No :id ⇒ a blank create form; with :id ⇒ prefilled from the
// cache. Save and cancel both leave the scene: a fresh create pops back to the
// kitchen, an edit pops back to that recipe's view (now showing the edits).
//
// Two doors open the CREATE form already importing (2026-10-27), read ONCE at mount
// and then stripped from the address (a reload, a back, a shared screenshot must not
// re-run them):
//   · `?import=<url>`      — the share page's « Importer comme recette »;
//   · `#import=<base64url>` — a page the « Envoyer à Babillard » bookmark captured in the
//     cook's own browser (lib/recipeBookmarklet). A hash never reaches any server.
export function RecipeFormPage() {
  const t = useT()
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const close = useSceneClose(id ? `/kitchen/recipe/${id}` : '/kitchen')
  const recipesQ = useRecipes({ enabled: !!id })
  const [autoImport] = useState<AutoImport | null>(() => {
    if (id) return null
    const page = parseRecipeHash(loc.hash)
    if (page) return { page }
    const url = new URLSearchParams(loc.search).get('import')?.trim()
    return url && /^https?:\/\//i.test(url) ? { url } : null
  })
  useEffect(() => {
    if (!loc.hash.startsWith('#import=') && !new URLSearchParams(loc.search).has('import')) return
    const q = new URLSearchParams(loc.search)
    q.delete('import')
    const search = q.toString()
    nav({ pathname: loc.pathname, search: search ? `?${search}` : '', hash: '' }, { replace: true })
    // Once: the address is cleaned the moment the scene has read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Read-only guest: the builder is a pure create/edit form — bounce out (also
  // guards a deep link). Placed after the hooks so the hook order is stable.
  if (isGuest()) return <Navigate to={id ? `/kitchen/recipe/${id}` : '/kitchen'} replace />

  if (id) {
    const recipe = recipesQ.data?.recipes.find((r) => r.id === id)
    if (!recipe)
      return recipesQ.isLoading ? <Loading /> : <StaleBounce to="/kitchen" message={t.kitchen.recipeGone} />
    return <RecipeForm value={recipe} onSaved={close} onCancel={close} />
  }
  return <RecipeForm value={null} onSaved={close} onCancel={close} autoImport={autoImport} />
}
