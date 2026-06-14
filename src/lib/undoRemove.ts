import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useUndoToast } from './toast'

// Deletes in Réglages used to be one tap and gone — the only destructive action
// in the app with no way back. Same calm pattern as the list/pantry now: the row
// leaves the cached list at once, the undo toast holds the real DELETE for a few
// seconds, and tapping Annuler restores it with zero round-trips.
export function useUndoableRemove() {
  const t = useT()
  const qc = useQueryClient()
  const undo = useUndoToast()
  return (opts: {
    queryKey: string[]
    listProp: string
    id: string
    label: string
    commit: () => Promise<unknown>
    after: () => void
  }) => {
    // Snapshot only the removed row + its slot, not the whole query: two deletes
    // of the same kind can stack within the undo window, and restoring a stale
    // full-list snapshot would resurrect a row a later (still-pending) delete had
    // already removed — and discard any edit made to that query in between.
    const cur = qc.getQueryData<Record<string, { id: string }[]>>(opts.queryKey)
    const list = cur?.[opts.listProp] ?? []
    const idx = list.findIndex((x) => x.id === opts.id)
    const removed = idx >= 0 ? list[idx] : null
    qc.setQueryData(opts.queryKey, (d: Record<string, { id: string }[]> | undefined) =>
      d ? { ...d, [opts.listProp]: d[opts.listProp].filter((x) => x.id !== opts.id) } : d,
    )
    undo({
      message: t.undo.cleared(opts.label),
      onUndo: () => {
        // Re-insert just this row at (about) its old spot into whatever the list
        // is now — leaves other deletes/edits in the same window untouched.
        if (!removed) return
        qc.setQueryData(opts.queryKey, (d: Record<string, { id: string }[]> | undefined) => {
          if (!d) return d
          const l = d[opts.listProp] ?? []
          if (l.some((x) => x.id === opts.id)) return d
          const next = l.slice()
          next.splice(Math.min(idx < 0 ? next.length : idx, next.length), 0, removed)
          return { ...d, [opts.listProp]: next }
        })
      },
      onCommit: () => {
        opts.commit().catch(() => {}).then(opts.after)
      },
    })
  }
}
