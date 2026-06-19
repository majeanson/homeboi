import { useState } from 'react'
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
// The fix: hide removed ids in LOCAL state and FILTER them out of the rendered
// list (`visible`), so NO refetch — poll, realtime, or invalidate — can resurrect
// them. Hold the real write behind the undo toast; on commit run it and AWAIT a
// refetch of the list before un-hiding, so we only stop hiding once the server
// frame actually reflects the removal (un-hiding earlier flashes the stale cached
// row back for a frame). Undo just un-hides — the write never ran (conflict-free).
//
// One instance per displayed list (pass its query key); call `remove` for both
// single-row deletes and batch "clear checked", filter the rows with `visible`.
export function useDeferredRemoval(queryKey: QueryKey) {
  const qc = useQueryClient()
  const undo = useUndoToast()
  const [pending, setPending] = useState<Set<string>>(new Set())

  function unhide(ids: string[]) {
    setPending((s) => {
      const n = new Set(s)
      ids.forEach((i) => n.delete(i))
      return n
    })
  }

  // Hide `ids` now and hold `commit` (the real write) behind the undo toast. Undo
  // un-hides them (the write never fires); the timer's commit runs the write, then
  // awaits the list refetch before un-hiding so the row can't flash back.
  function remove(ids: string[], message: string, commit: () => Promise<unknown> | void) {
    if (ids.length === 0) return
    setPending((s) => new Set([...s, ...ids]))
    undo({
      message,
      onUndo: () => unhide(ids),
      onCommit: async () => {
        await commit()
        await qc.refetchQueries({ queryKey }).catch(() => {})
        unhide(ids)
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
