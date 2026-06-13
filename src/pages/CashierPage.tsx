import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CashierMode } from '../components/CashierMode'
import { Loading } from '../components/Fallback'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { BOARD_KEY } from '../lib/queryKeys'
import { pickListFrom, unstageDeal, type ListItem } from '../lib/picks'
import { useSceneClose } from '../lib/sceneNav'

// /liste/cashier — the till-side stepper as a route (was a full-screen overlay
// toggled from Liste, with PriceMatchSheet able to stack ON TOP of it). The pick
// set is server state, so it reconstructs straight from the ['board'] cache — no
// props to thread. "Revise a price" hands back to /liste with ?proof=, which
// opens the price-match sheet there instead of stacking it over the cashier.
export function CashierPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const close = useSceneClose('/liste')
  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListItem[] }>('board'), ...live })
  const picks = pickListFrom(board?.list ?? [])

  // Nothing staged anymore (every deal removed, or a cold deep-link with an empty
  // cart) → there's no till to show; slip back to the list.
  useEffect(() => {
    if (board && picks.length === 0) close()
  }, [board, picks.length, close])

  if (!board) return <Loading />
  if (picks.length === 0) return null
  return (
    <CashierMode
      picks={picks}
      onRemove={(itemId) => unstageDeal(qc, itemId)}
      onRevise={(p) => nav(`/liste?proof=${encodeURIComponent(p.itemId)}&q=${encodeURIComponent(p.itemText)}`)}
      onClose={close}
    />
  )
}
