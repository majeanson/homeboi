import { addLocalDays, localDayStart, newId, nowSec } from './ids'
import { nextTurnIdx, parseRotation, prevTurnIdx, turnOf } from './rotation'
import { nextCycleDay } from './upkeep'
import { healClear } from './staleDelete'
import { withTaskDay } from './taskDay'

// WHAT A ROW DOES, for every task (plans/2026-11-06-TACHE-UNIFIEE.md, « Still to do » (3), the
// owner's decisions of 2026-11-10). Before 0153 a chore and a loose to-do did three things
// differently; each gesture is ONE function now, called by /api/tasks and by the three aliases
// (/api/chores, /api/todos, /api/home-projects), which only translate the request shapes an
// older bundle or a queued offline write still sends. None of them reads `kind` to decide.
//
//   · TICK: every tick records who did it in « qui a aidé » (`task_participants`): the face the
//     device acts as, else whose turn it was, else nobody. The turn moves only on a task with
//     « chacun son tour » (a rotation of two or more: `nextTurnIdx` leaves one person or nobody
//     where they are). A tick clears a « Reporter »: done beats postponed.
//   · UNTICK: puts back exactly what the tick moved (the stamp, the turn, the log line).
//   · « VIDER LES COCHÉS »: stamps `cleared_at` and deletes nothing. The task stays as history
//     (a subject's page, the calendar's struck cell). A stale id heals onto the same ticked
//     task, or the clear answers « nothing » (404): never a vacuous « ok ».
//   · « REPORTER »: quiet until a day, then the task returns by itself.
// The tick's moment is the real one (`tickedAt`, _lib/ids), so an offline tick replayed after
// midnight keeps its own day.

type Who = string | null

/** Tick a task done at `at`. `complete: false` is a helper pitching in (a toddler in kid view):
 *  logged, but the task is not finished and the turn does not move. Null: no such task. */
export async function tickTask(db: D1Database, hh: string, id: string, o: { who: Who; at: number; complete?: boolean | undefined; role?: string | undefined }): Promise<{ complete: boolean; nextIdx: number } | null> {
  const row = await db.prepare('SELECT rotation_json, current_idx FROM home_projects WHERE id = ? AND household_id = ?').bind(id, hh).first<{ rotation_json: string; current_idx: number }>()
  if (!row) return null
  const rotation = parseRotation(row.rotation_json)
  const who = o.who ?? turnOf(rotation, row.current_idx)
  const nextIdx = nextTurnIdx(rotation, row.current_idx)
  const complete = o.complete !== false
  const writes = [
    db.prepare('INSERT INTO task_participants (id, task_id, member_id, role, contributed_at) VALUES (?, ?, ?, ?, ?)').bind(newId(), id, who, o.role === 'child' ? 'child' : 'parent', o.at),
  ]
  if (complete)
    writes.push(
      db
        .prepare('UPDATE home_projects SET last_done_at = ?, last_done_by = ?, current_idx = ?, snoozed_until = NULL, updated_at = ? WHERE id = ? AND household_id = ?')
        .bind(o.at, who, nextIdx, nowSec(), id, hh),
    )
  await db.batch(writes)
  return { complete, nextIdx }
}

/** Take a tick back. False: no such task. A task with no tick is left alone, so a replayed or
 *  doubled untick never walks the turn backwards. */
export async function untickTask(db: D1Database, hh: string, id: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT rotation_json, current_idx, last_done_at FROM home_projects WHERE id = ? AND household_id = ?')
    .bind(id, hh)
    .first<{ rotation_json: string; current_idx: number; last_done_at: number | null }>()
  if (!row) return false
  if (row.last_done_at == null) return true
  await db.batch([
    db.prepare('DELETE FROM task_participants WHERE task_id = ? AND contributed_at = ?').bind(id, row.last_done_at),
    db
      .prepare('UPDATE home_projects SET last_done_at = NULL, last_done_by = NULL, cleared_at = NULL, current_idx = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(prevTurnIdx(parseRotation(row.rotation_json), row.current_idx), nowSec(), id, hh),
  ])
  return true
}

/** The rows a « Vider » names: the ids it sent that exist, plus, for each id that does not (a
 *  persisted optimistic tmp- row, a frame older than a re-add), the TICKED row of the same name
 *  that already existed when it was ticked (_lib/staleDelete `healClear`). Pure. */
export function clearedRows<R extends { id: string; text: string; created_at: number; done: boolean }>(rows: R[], ids: readonly string[], items: unknown, asOf: unknown): R[] {
  const named = new Set(ids)
  const matched = rows.filter((r) => named.has(r.id))
  const healed = healClear(
    rows.filter((r) => r.done),
    items,
    asOf,
    new Set(matched.map((r) => r.id)),
  )
  return [...matched, ...healed]
}

/** Stamp these tasks out of the day: history, never a delete. D1 caps bound variables, so in slices. */
export function clearTaskStatements(db: D1Database, hh: string, ids: readonly string[], ts: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50)
    out.push(db.prepare(`UPDATE home_projects SET cleared_at = ? WHERE household_id = ? AND id IN (${slice.map(() => '?').join(',')})`).bind(ts, hh, ...slice))
  }
  return out
}

/** « Vider les cochés » over the spine. `ids` null: every ticked task. Answers the ids it
 *  cleared; an empty answer to a named clear is « nothing to clear » (the caller says 404). */
export async function clearTasks(db: D1Database, hh: string, ids: readonly string[] | null, items: unknown, asOf: unknown): Promise<string[]> {
  const ts = nowSec()
  if (ids == null) {
    await db.prepare('UPDATE home_projects SET cleared_at = ? WHERE household_id = ? AND last_done_at IS NOT NULL').bind(ts, hh).run()
    return []
  }
  const rows = (
    await db.prepare('SELECT id, title AS text, created_at, last_done_at IS NOT NULL AS done FROM home_projects WHERE household_id = ?').bind(hh).all<{ id: string; text: string; created_at: number; done: number }>()
  ).results.map((r) => ({ ...r, done: r.done === 1 }))
  const doomed = clearedRows(rows, ids, items, asOf).map((r) => r.id)
  if (doomed.length > 0) await db.batch(clearTaskStatements(db, hh, doomed, ts))
  return doomed
}

/** « Reporter »: a week, to the next occurrence (a series; else a week), or null to wake it.
 *  Answers the day it returns, 'missing' for no such task, 'bad' for an unknown mode. */
export async function snoozeTask(db: D1Database, hh: string, id: string, mode: unknown): Promise<{ until: number | null } | 'missing' | 'bad'> {
  let until: number | null = null
  if (mode !== null) {
    if (mode !== 'week' && mode !== 'cycle') return 'bad'
    const today = localDayStart(new Date(nowSec() * 1000))
    if (mode === 'cycle') {
      const row = await db
        .prepare('SELECT at, recur_json, recur_from, last_done_at FROM home_projects WHERE id = ? AND household_id = ?')
        .bind(id, hh)
        .first<{ at: number | null; recur_json: string | null; recur_from: string | null; last_done_at: number | null }>()
      if (!row) return 'missing'
      until = nextCycleDay(withTaskDay(row), today) ?? addLocalDays(today, 7)
    } else {
      until = addLocalDays(today, 7)
    }
  }
  const res = await db.prepare('UPDATE home_projects SET snoozed_until = ?, updated_at = ? WHERE id = ? AND household_id = ?').bind(until, nowSec(), id, hh).run()
  return res.meta.changes ? { until } : 'missing'
}
