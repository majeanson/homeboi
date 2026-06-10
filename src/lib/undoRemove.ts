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
    const prev = qc.getQueryData(opts.queryKey)
    qc.setQueryData(opts.queryKey, (d: Record<string, { id: string }[]> | undefined) =>
      d ? { ...d, [opts.listProp]: d[opts.listProp].filter((x) => x.id !== opts.id) } : d,
    )
    undo({
      message: t.undo.cleared(opts.label),
      onUndo: () => {
        if (prev) qc.setQueryData(opts.queryKey, prev)
      },
      onCommit: () => {
        opts.commit().catch(() => {}).then(opts.after)
      },
    })
  }
}
