import { useSyncExternalStore } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useUndoToast } from './toast'

// The ONE bulletproof "calm delete / clear" for a LIVE-POLLED list — codified from
// the pattern La liste and À cocher already used, so every list shares one
// implementation instead of re-spelling it (and re-introducing the bug).
//
// The race it kills: a delete that only mutates the cache optimistically
// (setQueryData) is *overwritten* by the next background poll (these lists run
// `...live` → staleTime 0, ~10 s interval) while the real DELETE is still held
// behind the undo toast. The row flashes back, then disappears again once the
// write finally lands — exactly the "remove it fast and it comes back, then
// vanishes" glitch. A realtime nudge or another write's invalidate triggers the
// same resurrection.
//
// The fix: hold the row's id in a PENDING set and FILTER it out of the rendered
// list (`visible`), so NO refetch — poll, realtime, or invalidate — can resurrect
// it. Hold the real write behind the undo toast; on commit run it and AWAIT a
// refetch before un-hiding, so we only stop hiding once the server frame actually
// reflects the removal (un-hiding earlier flashes the stale cached row back for a
// frame). Undo just un-hides — the write never ran (conflict-free).
//
// CROSS-SURFACE: the pending set is a MODULE-level store, not per-component state,
// so a row shown in two places at once (e.g. a today-pinned todo on both the day
// page and the board's Aujourd'hui glance) hides on BOTH the instant either one
// deletes it — instead of lingering on the other surface for the whole 15 s undo
// window (it isn't deleted server-side until commit, so a poll would keep showing
// it). It's keyed by SCOPE = the query key's resource head (`queryKey[0]`, e.g.
// 'todos'), so every todo list shares one bucket while leftovers/pantry/… stay
// independent; the app's opaque ids are globally unique, so even a shared bucket
// can't hide the wrong row. The store also outlives the originating component, so
// navigating away mid-undo still un-hides correctly when the held write commits
// (the timer lives at the app root in lib/toast).

// scope -> the set of ids currently held out of view. Each mutation REPLACES the
// scope's Set (immutable) so useSyncExternalStore sees a new snapshot; an absent
// scope reads as the shared EMPTY singleton (a stable ref, so no render churn).
const buckets = new Map<string, ReadonlySet<string>>()
const EMPTY: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

const scopeOf = (queryKey: QueryKey): string => String(Array.isArray(queryKey) ? queryKey[0] : queryKey)
const emit = () => listeners.forEach((l) => l())
const snapshot = (scope: string): ReadonlySet<string> => buckets.get(scope) ?? EMPTY

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function hideIds(scope: string, ids: string[]): void {
  const next = new Set(buckets.get(scope) ?? EMPTY)
  ids.forEach((id) => next.add(id))
  buckets.set(scope, next)
  emit()
}

function unhideIds(scope: string, ids: string[]): void {
  const cur = buckets.get(scope)
  if (!cur) return
  const next = new Set(cur)
  ids.forEach((id) => next.delete(id))
  if (next.size) buckets.set(scope, next)
  else buckets.delete(scope)
  emit()
}

// One displayed list (pass its query key); call `remove` for both single-row
// deletes and batch "clear checked", filter the rows with `visible`. Every list
// keying off the same resource head shares the pending set, so a delete on one
// surface hides the row on every surface showing it.
export function useDeferredRemoval(queryKey: QueryKey) {
  const qc = useQueryClient()
  const undo = useUndoToast()
  const scope = scopeOf(queryKey)
  const pending = useSyncExternalStore(subscribe, () => snapshot(scope), () => snapshot(scope))

  // Hide `ids` now (on every surface in this scope) and hold `commit` (the real
  // write) behind the undo toast. Undo un-hides them (the write never fires); the
  // timer's commit runs the write, then awaits the list refetch before un-hiding
  // so the row can't flash back.
  function remove(ids: string[], message: string, commit: () => Promise<unknown> | void) {
    if (ids.length === 0) return
    hideIds(scope, ids)
    undo({
      message,
      onUndo: () => unhideIds(scope, ids),
      onCommit: async () => {
        await commit()
        // Await a refetch of EVERY mounted surface in this scope (the prefix [scope]
        // matches both the board glance ['todos'] and any day page ['todos', <day>])
        // before un-hiding — otherwise the surface that didn't issue the delete could
        // flash the row back for a frame, between un-hide and its own refetch landing.
        await qc.refetchQueries({ queryKey: [scope], type: 'active' }).catch(() => {})
        unhideIds(scope, ids)
      },
    })
  }

  return {
    remove,
    isPending: (id: string) => pending.has(id),
    // Drop the rows whose removal is still settling — call on the rendered array.
    visible: <T extends { id: string }>(rows: T[]): T[] => rows.filter((r) => !pending.has(r.id)),
  }
}

// Exported for unit tests — the pure store, exercised without React.
export const _deferredRemovalStore = { hideIds, unhideIds, snapshot, scopeOf, EMPTY }
