import { normalizeItem } from './normalize'
import { FACE, todoRowsSql } from './taskItem'

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
type StaleDelete =
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
  // A to-do lives in one of two tables since 0150: a loose one on the spine (kind 'todo'), a
  // departure instance in `todos`. Ids never collide across them (the migration kept them
  // apart by its primary key), so deleting an id from both deletes exactly one row.
  const removeById = async (rowId: string): Promise<number> => {
    if (table !== 'todos') return (await db.prepare(`DELETE FROM ${table} WHERE id = ? AND household_id = ?`).bind(rowId, householdId).run()).meta.changes
    const [spine, rest] = await db.batch([
      db.prepare(`DELETE FROM home_projects WHERE id = ? AND household_id = ? AND ${FACE.todo}`).bind(rowId, householdId),
      db.prepare('DELETE FROM todos WHERE id = ? AND household_id = ?').bind(rowId, householdId),
    ])
    return (spine?.meta.changes ?? 0) + (rest?.meta.changes ?? 0)
  }
  if ((await removeById(id)) > 0) return { outcome: 'deleted', id }

  const asOf = typeof spec.asOf === 'number' && Number.isFinite(spec.asOf) ? Math.floor(spec.asOf) : null
  const key = typeof spec.text === 'string' && spec.text.trim() ? normalizeItem(spec.text) : ''
  if (key && asOf) {
    // Open rows first (a still-to-do line is the one being swiped), oldest first.
    const stmt =
      table === 'todos'
        ? db.prepare(todoRowsSql(`id, ${textColumn} AS text`, 'WHERE created_at <= ?2 ORDER BY done_at IS NOT NULL, created_at')).bind(householdId, asOf)
        : db.prepare(`SELECT id, ${textColumn} AS text FROM ${table} WHERE household_id = ? AND created_at <= ? ORDER BY checked_at IS NOT NULL, created_at`).bind(householdId, asOf)
    const { results } = await stmt.all<{ id: string; text: string }>()
    const hit = results.find((r) => normalizeItem(r.text) === key)
    if (hit) {
      await removeById(hit.id)
      // The field diagnostic: `wrangler tail` names the stale id's shape (tmp- vs real)
      // the next time a device does this, without a repro session.
      console.warn(`${table} DELETE healed a stale id onto the same item: ${id} → ${hit.id}`)
      return { outcome: 'healed', id: hit.id }
    }
  }
  console.warn(`${table} DELETE matched 0 rows (id ${id}${key ? ', no same-item row to heal onto' : ', no text sent'})`)
  return { outcome: 'missing' }
}

// « Vider les cochés » — the BATCH twin of deleteHealing. The client names the rows it
// ticked by id (a snapshot, so a tick made after the undo toast was scheduled is not swept
// up); an id the database does not have — a persisted optimistic `tmp-…` row, a frame that
// predates a re-add — used to match nothing, clear NOTHING and answer « ok », and the
// still-ticked same-named line repainted (the swipe bug's batch cousin, 2026-10-06).
//
// Given the household's ELIGIBLE rows (the ticked ones), the ids the client named, what it
// called them and when it ticked, return the rows that stand in for the stale ids: each
// stale name is matched, once, to a ticked row of the same normalized name that already
// existed at `asOf`. Eligible = ticked on purpose: an unticked line is never cleared by a
// stand-in, whatever its name. Pure, so the rules are pinned without a database.
export function healClear<R extends { id: string; created_at: number }>(
  eligible: (R & { text: string })[],
  wanted: unknown,
  asOf: unknown,
  matchedIds: ReadonlySet<string>,
): (R & { text: string })[] {
  const at = typeof asOf === 'number' && Number.isFinite(asOf) ? Math.floor(asOf) : null
  if (!at || !Array.isArray(wanted)) return []
  const used = new Set(matchedIds)
  const healed: (R & { text: string })[] = []
  for (const w of wanted as { id?: unknown; text?: unknown }[]) {
    if (!w || typeof w.id !== 'string' || typeof w.text !== 'string') continue
    if (matchedIds.has(w.id)) continue
    const key = normalizeItem(w.text)
    if (!key) continue
    const hit = eligible.find((r) => !used.has(r.id) && r.created_at <= at && normalizeItem(r.text) === key)
    if (!hit) continue
    used.add(hit.id)
    healed.push(hit)
    console.warn(`clear-checked healed a stale id onto the same item: ${w.id} → ${hit.id}`)
  }
  return healed
}
