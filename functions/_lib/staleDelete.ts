import { normalizeItem } from './normalize'

// THE delete for a resource whose client paints OPTIMISTIC rows (`tmp-…` ids): the
// list and the todos. Everything else here deletes by an id the server minted, and a
// vacuous « ok » on an id that is already gone is the truthful answer.
//
// For these two it is not. The client's id can be one the database never had (a
// persisted optimistic row from a dead session, a frame that predates a « Vider » +
// re-add), and the client's deferred removal TRUSTS a 200: it keeps the row hidden
// until a fresh frame lands, then un-hides — which repaints the same-named line it
// never touched. 2026-10-06, verified against production: six `{"ok":true}` swipe
// deletes, zero rows gone, « the items always come back ». Three truths instead:
//
//   deleted — the id matched; the common case.
//   healed  — the id matched nothing, but the client said WHAT it was deleting (`text`)
//             and WHEN (`asOf`, the gesture's epoch seconds): delete the same ITEM the
//             way a POST re-uses one. Only a line that already existed at `asOf`
//             qualifies, so a queued offline delete replaying late can never eat a
//             same-named line someone re-added meanwhile.
//   missing — nothing safe to delete: say so (404), so the client un-hides honestly or
//             treats it as already gone — it never confirms a deletion that never
//             happened.
//
// Pass the table's TITLE column as `textColumn`; both tables carry `created_at`.
export type StaleDelete =
  | { outcome: 'deleted'; id: string }
  | { outcome: 'healed'; id: string }
  | { outcome: 'missing' }

export async function deleteHealing(
  db: D1Database,
  spec: {
    table: 'list_items' | 'todos'
    textColumn: 'text' | 'title'
    householdId: string
    id: string
    text?: unknown
    asOf?: unknown
  },
): Promise<StaleDelete> {
  const { table, textColumn, householdId, id } = spec
  const res = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND household_id = ?`).bind(id, householdId).run()
  if (res.meta.changes > 0) return { outcome: 'deleted', id }

  const asOf = typeof spec.asOf === 'number' && Number.isFinite(spec.asOf) ? Math.floor(spec.asOf) : null
  const key = typeof spec.text === 'string' && spec.text.trim() ? normalizeItem(spec.text) : ''
  if (key && asOf) {
    const { results } = await db
      .prepare(
        // Open rows first (a still-to-do line is the one being swiped), oldest first.
        `SELECT id, ${textColumn} AS text FROM ${table} WHERE household_id = ? AND created_at <= ? ORDER BY ${
          table === 'todos' ? 'done_at' : 'checked_at'
        } IS NOT NULL, created_at`,
      )
      .bind(householdId, asOf)
      .all<{ id: string; text: string }>()
    const hit = results.find((r) => normalizeItem(r.text) === key)
    if (hit) {
      await db.prepare(`DELETE FROM ${table} WHERE id = ? AND household_id = ?`).bind(hit.id, householdId).run()
      // The field diagnostic: `wrangler tail` names the stale id's shape (tmp- vs real)
      // the next time a device does this, without a repro session.
      console.warn(`${table} DELETE healed a stale id onto the same item: ${id} → ${hit.id}`)
      return { outcome: 'healed', id: hit.id }
    }
  }
  console.warn(`${table} DELETE matched 0 rows (id ${id}${key ? ', no same-item row to heal onto' : ', no text sent'})`)
  return { outcome: 'missing' }
}
