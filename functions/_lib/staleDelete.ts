import { deleteTaskStatements } from './taskItem'

// THE delete for a resource whose client paints OPTIMISTIC rows: the list, the todos, the
// tasks. The id is always the row's real one now: the client mints it (`newRowId`, a UUID the
// create carries, review #39), so there is no stand-in id for a delete to miss.
//
// What stays is the honest answer. A delete that matched nothing says so (false → the caller
// answers 404), because the client's deferred removal TRUSTS a 200: a vacuous « ok » once
// confirmed six deletions that never happened (2026-10-06, « the items always come back »).
// A 404 reads as « already gone » there (useDeferredRemoval.rejectionMeansGone).
//
// The text-matched « healing » this file used to do is gone with the tmp ids it existed for:
// deleting a DIFFERENT row whose name matched was a guess, and with two « lait » lines it
// guessed the oldest.
export async function deleteOwnRow(
  db: D1Database,
  spec: {
    /** `tasks`: any task on the spine. `todos`: a task OR a departure checklist instance. */
    table: 'list_items' | 'todos' | 'tasks'
    householdId: string
    id: string
  },
): Promise<boolean> {
  const { table, householdId, id } = spec
  if (table === 'list_items') return (await db.prepare('DELETE FROM list_items WHERE id = ? AND household_id = ?').bind(id, householdId).run()).meta.changes > 0
  // A task is one row of the spine whatever it used to be (0153), deleted with its « qui a
  // aidé » lines; through the to-do alias the id may also name a departure instance in `todos`.
  // Ids never collide across the two tables (0150 kept them apart by its primary key), so
  // deleting an id from both deletes exactly one row.
  const stmts = deleteTaskStatements(db, householdId, id)
  if (table === 'todos') stmts.push(db.prepare('DELETE FROM todos WHERE id = ? AND household_id = ?').bind(id, householdId))
  // The first statement clears the log: count the rows themselves.
  const n = (await db.batch(stmts)).slice(1).reduce((s, d) => s + (d.meta.changes ?? 0), 0)
  if (n === 0) console.warn(`${table} DELETE matched 0 rows (id ${id})`)
  return n > 0
}
