import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CashierMode } from '../components/CashierMode'
import { Loading } from '../components/Fallback'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { BOARD_KEY } from '../lib/queryKeys'
import { pickListFrom, type ListItem } from '../lib/picks'
import { useSceneClose } from '../lib/sceneNav'

// /liste/cashier — the till-side stepper as a route (was a full-screen overlay
// toggled from Liste, with the price-match sheet able to stack ON TOP of it). The
// pick set is server state, so it reconstructs straight from the ['board'] cache —
// no props to thread. The peek is a clean, read-only proof (no edit/delete) — revise
// or remove a staged deal back on the list / price-match route instead.
export function CashierPage() {
  const close = useSceneClose('/liste')
  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListItem[] }>('board'), ...live })
  // Stores the household chose to hide at the till (Réglages ▸ Mes magasins ▸ "À la
  // caisse: Non") — e.g. the store you do your own shopping at, where showing its own
  // flyer to its own cashier is pointless. Filtered here so the count + stepper only
  // ever see the kept picks. Cached, refetched in the background; stale is fine.
  const { data: hh } = useQuery({
    queryKey: ['household'],
    queryFn: () => api<{ cashierExcludedStores: string[] }>('household'),
    staleTime: 5 * 60_000,
  })
  const hidden = new Set(hh?.cashierExcludedStores ?? [])
  const picks = pickListFrom(board?.list ?? []).filter((p) => !hidden.has(p.deal.merchant.trim().toLowerCase()))

  // Nothing staged anymore (every deal removed, or a cold deep-link with an empty
  // cart) → there's no till to show; slip back to the list.
  useEffect(() => {
    if (board && picks.length === 0) close()
  }, [board, picks.length, close])

  if (!board) return <Loading />
  if (picks.length === 0) return null
  return <CashierMode picks={picks} onClose={close} />
}
