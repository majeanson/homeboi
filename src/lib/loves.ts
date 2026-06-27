import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useWrite } from './write'
import { useProfile } from './profile'
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
  const write = useWrite()
  const { memberId } = useProfile()
  const { data } = useQuery({ queryKey: LOVES_KEY, queryFn: () => api<{ loves: Love[] }>('recipe-loves') })
  const loves = data?.loves ?? []
  // Member ids who loved a given recipe (the faces to show — no number).
  const loversOf = (recipeId: string) => loves.filter((l) => l.recipe_id === recipeId).map((l) => l.member_id)
  // Recipe ids loved by ANYONE — the set the "Favoris" recipe pill filters by.
  // Memoized on the raw data so it's a stable dependency for downstream filters.
  const lovedSet = useMemo(() => new Set((data?.loves ?? []).map((l) => l.recipe_id)), [data])
  // A user-content write → through the offline outbox (useWrite), not bare api():
  // optimistically flip the active profile's love so the heart updates instantly
  // (and offline), then affectedKeys reconciles on the next poll / replay.
  async function toggle(recipeId: string, mine: boolean) {
    await write('recipe-loves', {
      method: mine ? 'DELETE' : 'POST',
      body: { recipeId },
      affectedKeys: [LOVES_KEY],
      optimistic: (qc) => {
        if (!memberId) return
        qc.setQueryData<{ loves: Love[] }>(LOVES_KEY, (d) => {
          const cur = d?.loves ?? []
          if (mine) return { loves: cur.filter((l) => !(l.recipe_id === recipeId && l.member_id === memberId)) }
          if (cur.some((l) => l.recipe_id === recipeId && l.member_id === memberId)) return { loves: cur }
          return { loves: [...cur, { recipe_id: recipeId, member_id: memberId }] }
        })
      },
    }).catch(() => {})
  }
  return { loversOf, toggle, lovedSet }
}
