import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { LOVES_KEY } from './queryKeys'

// Family "favorites" hearts (#21) — the shared love map, read anywhere a recipe
// (or a planned meal linked to one) shows. A preference signal, not a score: we
// expose WHO loved a recipe, never a count/rank. `toggle` flips the active
// profile's love and invalidates the shared key so every heart re-renders.
interface Love {
  recipe_id: string
  member_id: string
}

export function useLoves() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: LOVES_KEY, queryFn: () => api<{ loves: Love[] }>('recipe-loves') })
  const loves = data?.loves ?? []
  // Member ids who loved a given recipe (the faces to show — no number).
  const loversOf = (recipeId: string) => loves.filter((l) => l.recipe_id === recipeId).map((l) => l.member_id)
  async function toggle(recipeId: string, mine: boolean) {
    await api('recipe-loves', { method: mine ? 'DELETE' : 'POST', body: { recipeId } }).catch(() => {})
    qc.invalidateQueries({ queryKey: LOVES_KEY })
  }
  return { loversOf, toggle }
}
