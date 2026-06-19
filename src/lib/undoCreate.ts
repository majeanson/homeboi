import { useCallback } from 'react'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { useWrite, type WriteResult } from './write'
import { useRecordUndo } from './toast'

// The create-side companion to useUndoableRemove / useDeferredRemoval: POST a new
// row, then offer a COMPENSATING undo that DELETEs exactly that row. The subtle bit
// — easy to get wrong by hand, and re-spelled at ~9 call sites — is that the server
// id only exists on a real, non-queued response:
//   · online  → res.data.id is the new row → the undo can DELETE it.
//   · offline → the write is queued (no id yet) and a guest write is refused (data
//     null); there is nothing to DELETE, so the undo is a no-op and (by default) the
//     toast is skipped — removing the row is the way back once it syncs.
// Keeping this in one place means a create can't silently lose its offline-safety.

// Pure: the new row's server id, or undefined when the write was queued/refused.
// Exported for a unit test (the hook itself can't be unit-tested without React).
export function createdId(res: WriteResult<{ id?: string }> | null): string | undefined {
  return res && !res.queued ? res.data?.id : undefined
}

export interface CreateWithUndoOpts {
  /** Endpoint to POST the new row to. */
  endpoint: string
  body: object
  affectedKeys: QueryKey[]
  /** Optimistic cache write applied immediately (offline creates write a temp row). */
  optimistic?: (qc: QueryClient) => void
  /** Undo toast copy (e.g. t.undo.added(title)). */
  message: string
  /** The compensating DELETE target — defaults to `endpoint` / `affectedKeys`. */
  undoEndpoint?: string
  undoAffectedKeys?: QueryKey[]
  /** Show the undo toast even with no server id yet (offline) — the DELETE then
   *  no-ops. Matches the board's leftover adds, which always toast. Default false. */
  toastWhenQueued?: boolean
}

export function useCreateWithUndo() {
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return useCallback(
    async (opts: CreateWithUndoOpts): Promise<WriteResult<{ id?: string }> | null> => {
      const res = await write<{ id?: string }>(opts.endpoint, {
        method: 'POST',
        body: opts.body,
        affectedKeys: opts.affectedKeys,
        optimistic: opts.optimistic,
      }).catch(() => null)
      const id = createdId(res)
      if (id || opts.toastWhenQueued)
        recordUndo({
          message: opts.message,
          onUndo: () => {
            if (id)
              void write(opts.undoEndpoint ?? opts.endpoint, {
                method: 'DELETE',
                body: { id },
                affectedKeys: opts.undoAffectedKeys ?? opts.affectedKeys,
              }).catch(() => {})
          },
        })
      return res
    },
    [write, recordUndo],
  )
}
