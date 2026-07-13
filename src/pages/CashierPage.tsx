import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CashierMode } from '../components/CashierMode'
import { Loading } from '../components/Fallback'
import { EmptyState } from '../components/EmptyState'
import { SceneHead } from '../components/SceneHead'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { BOARD_KEY } from '../lib/queryKeys'
import { cashierPicksFrom, useTillHiddenStores, type ListItem } from '../lib/picks'
import { useSceneClose } from '../lib/sceneNav'

// /liste/cashier — the till-side stepper as a route (was a full-screen overlay
// toggled from Liste, with the price-match sheet able to stack ON TOP of it). The
// pick set is server state, so it reconstructs straight from the ['board'] cache —
// no props to thread. The peek is a clean, read-only proof (no edit/delete) — revise
// or remove a staged deal back on the list / price-match route instead.
export function CashierPage() {
  const t = useT()
  const close = useSceneClose('/liste')
  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListItem[] }>('board'), ...live })
  // Stores the household chose to hide at the till (Réglages ▸ Magasinage ▸ "À la
  // caisse: Non") — filtered via the SAME shared helpers as the « Montrer à la
  // caisse » button on La liste, so the button's count and this stepper agree.
  const tillHidden = useTillHiddenStores()
  const picks = cashierPicksFrom(board?.list ?? [], tillHidden)

  // Did the till EVER have picks this session? Distinguishes "you cleared the last
  // deal → you're done, slip back to the list" from "cold deep-link that was never
  // non-empty → show a calm message, don't silently bounce".
  const hadPicks = useRef(false)
  useEffect(() => {
    if (picks.length > 0) hadPicks.current = true
  }, [picks.length])

  // Auto-slip back to the list ONLY when the till emptied during this session.
  useEffect(() => {
    if (board && picks.length === 0 && hadPicks.current) close()
  }, [board, picks.length, close])

  if (!board) return <Loading />
  if (picks.length === 0) {
    // Emptied in-session → the effect above is slipping us back; render nothing.
    // Cold deep-link → explain there's nothing at the till (with a way back), instead
    // of flashing Loading→blank→redirect with no message.
    if (hadPicks.current) return null
    return (
      <div className="scene">
        <SceneHead title={t.shop.cashierTitle} icon="receipt-bold" onClose={close} offline />
        <EmptyState guide={{ card: 'deals', point: 5 }}>{t.shop.cashierEmpty}</EmptyState>
      </div>
    )
  }
  return <CashierMode picks={picks} onClose={close} />
}
