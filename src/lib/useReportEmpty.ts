import { createContext, useContext, useEffect } from 'react'

// The ONE "this card has nothing to show" channel (board widget space).
//
// Before this, a board card said "I'm empty" by returning `null` from its render.
// That works for hide-when-empty, but it's invisible to the shell: the slot can't
// tell "empty" from "still loading", and it can never offer the opposite choice —
// « Toujours afficher » (keep the card, show an EmptyState). So emptiness becomes
// a value a card REPORTS, and `CardSlot` decides what to do with it per the
// device's per-card mode (`always` | `auto` | `never`, lib/boardCards).
//
// Two channels feed one decision, because the data lives in two places:
//   • LENS-computed — Board.tsx already holds the rows (today/tomorrow/upcoming…),
//     so it passes `<CardSlot empty={…}>` directly.
//   • SELF-computed — a self-fetching card (L'auto, Les carnets, Photo du jour…)
//     only learns it's empty after its own query resolves, so it calls
//     `useReportEmpty(rows.length === 0)` instead of `return null`.
// `CardSlot` resolves `empty = prop ?? reported ?? false`.
//
// Outside a slot the context is null and the hook is an inert no-op — a card still
// renders standalone (in /dev/kit, or a scene) without knowing about the board.
//
// LOOP SAFETY (see the Kitchen→HubLayout freeze, `babillard-child-shell-registration-loop`):
// this is a child→parent-shell registration channel, so it follows that hard-won rule —
// register only the CURRENT value, let the shell's setter BAIL when the value is
// unchanged, and clear in a SEPARATE unmount-only effect. Never a per-run cleanup that
// resets the value with a setup that flips it back: that's two state writes per run and
// re-renders forever the moment a dep is unstable. With this shape, correctness does not
// depend on `report` being referentially stable — an unstable one is a harmless no-op.

export type EmptyReporter = (empty: boolean) => void

export const CardEmptyContext = createContext<EmptyReporter | null>(null)

export function useReportEmpty(empty: boolean): void {
  const report = useContext(CardEmptyContext)

  // Register the current state. Idempotent: the shell drops a write whose value
  // already matches, so a re-run costs nothing.
  useEffect(() => {
    report?.(empty)
  }, [report, empty])

  // Clear on the way out, and ONLY on the way out. A card that unmounts stops
  // claiming to be empty, so a slot left mounted (mode changed under it) doesn't
  // stay collapsed on a stale report.
  useEffect(() => () => report?.(false), [report])
}
