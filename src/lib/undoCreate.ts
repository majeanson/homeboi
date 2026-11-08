import { useCallback } from 'react'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { useWrite, type WriteResult, writeFailed } from './write'
import { useRecordUndo } from './toast'
import { recordTmpId } from './tmpIds'

// The create-side companion to useDeferredRemoval: POST a new
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
  /** The optimistic temp row's id (E-41) — lets the outbox rewrite later queued ops
   *  from the tmp id to the real one once the create replays. */
  tmpId?: string
  /** Undo toast copy (e.g. t.undo.added(title)). */
  message: string
  /** The compensating DELETE target — defaults to `endpoint` / `affectedKeys`. */
  undoEndpoint?: string
  undoAffectedKeys?: QueryKey[]
  /** Show the undo toast even with no server id yet (offline) — the DELETE then
   *  no-ops. Matches the board's leftover adds, which always toast. Default false. */
  toastWhenQueued?: boolean
  /** Re-throw a failed write instead of resolving null — for a caller whose failure
   *  path is a THROW (an error line under the field, the typed text kept). Default
   *  false: most callers read `null` as « failed, keep the text ». */
  rethrow?: boolean
  /** Runs after « Annuler » fires — for LOCAL state the add changed that the DELETE
   *  cannot reach (⚡ quick add's ✓ chip, which must not go on certifying a line that
   *  is gone). */
  afterUndo?: () => void
}

// MANY creates, ONE undo: a starter pack (« La maison à l'automne ») adds several rows with one
// tap, and one « Annuler » takes back every row the server named. Same rule as above for a
// queued create (no id, nothing to delete), and a failed write reports once, calmly.
export interface CreateManyWithUndoOpts {
  endpoint: string
  bodies: object[]
  affectedKeys: QueryKey[]
  message: string
}

export function useCreateManyWithUndo() {
  const write = useWrite()
  const recordUndo = useRecordUndo()
  return useCallback(
    async (opts: CreateManyWithUndoOpts): Promise<string[]> => {
      const ids: string[] = []
      let failed: unknown = null
      // One after another: a pack is a handful of rows, and order keeps the list as listed.
      for (const body of opts.bodies) {
        const res = await write<{ id?: string }>(opts.endpoint, { method: 'POST', body, affectedKeys: opts.affectedKeys }).catch((err: unknown) => {
          failed ??= err
          return null
        })
        const id = createdId(res)
        if (id) ids.push(id)
      }
      if (failed) writeFailed(failed)
      if (ids.length > 0)
        recordUndo({
          message: opts.message,
          onUndo: () => {
            for (const id of ids) void write(opts.endpoint, { method: 'DELETE', body: { id }, affectedKeys: opts.affectedKeys }).catch(writeFailed)
          },
        })
      return ids
    },
    [write, recordUndo],
  )
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
        tmpId: opts.tmpId,
      }).catch((err: unknown) => {
        if (opts.rethrow) throw err
        return null
      })
      const id = createdId(res)
      // E-41's online half (lib/tmpIds): the optimistic tmp row now has a real id.
      // Anything that captured the tmp id and acts later (a deferred swipe-delete's
      // held write, a clear-checked batch) resolves through the registry at fire
      // time instead of DELETEing an id the server never had.
      if (id && opts.tmpId) recordTmpId(opts.tmpId, id)
      if (id || opts.toastWhenQueued)
        recordUndo({
          message: opts.message,
          onUndo: () => {
            if (id)
              void write(opts.undoEndpoint ?? opts.endpoint, {
                method: 'DELETE',
                body: { id },
                affectedKeys: opts.undoAffectedKeys ?? opts.affectedKeys,
              }).catch(writeFailed)
            opts.afterUndo?.()
          },
        })
      return res
    },
    [write, recordUndo],
  )
}
