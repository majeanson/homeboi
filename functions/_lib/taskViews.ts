import { parseRecur, rotationOffset } from './recur'
import { effectiveAnchor, upkeepOccurrences } from './upkeep'
import { parseRotation, turnOf } from './rotation'
import { isSoon } from './reminder'
import { addLocalDays, localDayStart } from './ids'
import { aheadThisWeek, faceOfKind, kindOf, present, spineTask, todoRowsSql } from './taskItem'
import type { SubjectRef } from './subject'
import type { TaskItem, TasksWire } from './wire'

// EVERY READER OF A TASK READS IT HERE (plans/2026-11-06-TACHE-UNIFIEE.md, « align every view »).
//
// One row shape, `TaskRow`, read with one column list, `TASK_COLS`, from the one table every
// task lives in since 0150 (`home_projects`, the spine), turned into a task by ONE builder
// (`spineTask`, _lib/taskItem). A reader — the board, the calendar, the year, « Cette semaine »,
// the recap, the house assistant, the Tâches view — asks this file for what it shows.
//
// ONE RULE PER QUESTION, read off a task's AXES (does it have a date? a recurrence? is it done?
// what is it about?), never off its face. The owner's decision (2026-11-08): « every dated
// task gets a calendar and year cell, struck through once done; the recap and the assistant
// hear every task done this week ». Each rule, once:
//
//   question                 the rule (every task)                                 where
//   a calendar / year cell   every occurrence of a dated task in the window; a     `cellsOf`
//                            one-off keeps its cell once done (`done`, struck)
//   whose turn on a cell     the rotation projected per occurrence; else the       `cellsOf`
//                            task's owner (a to-do's author)
//   the board card           due, owed or ticked today (TaskItem.onBoard)         `boardTasks`
//   « À venir »              open, next date in the six days after today           `boardTasks`
//   carry-forward («owed»)   TaskItem.overdueSince, for every task                 _lib/taskItem
//   « Cette semaine »        ahead: open, next date this week; behind: done in     `weekTasks`
//                            the week (what the contribution log does not
//                            already name)
//   recap                    every task done since the date                       `recapTaskTitles`
//   house assistant          every open task's title                              `askTaskTitles`
//   a subject's history      every completion: the contribution log, and each     `subjectHistory`
//                            task's last tick the log does not hold
//   « Sur quoi ? » projects  kind = 'plan' (see `allTasks` for why)                `allTasks`
//
// WHAT `kind` STILL DOES. 'upkeep' and 'plan' are behaviours (the season card, a project's
// notes and budget, « Sur quoi ? »). 'chore' and 'todo' are read in exactly one place:
// `source`, the alias a row's gestures go to (a chore's tick logs « qui a aidé » and moves
// the turn, a to-do's « Vider » deletes, lib/taskSave). Nothing a household SEES differs
// between the two any more; shrinking `kind` to `plan | upkeep | null` waits on one tick
// semantics for both (STATE.md §3).
//
// The stored `at` is the start of a schedule for every task: a recurrence with no start
// reads as undated. Migration 0152 gave every recurring chore without one its `created_at`
// (what `choreSchedule` read it as since 0032), so no reader needs that fallback any more.

/** Every column a reader of a task needs, in its stored name but for `colour AS color`. */
export const TASK_COLS =
  'id, kind, title, colour AS color, at, recur_json, recur_from, lead_seconds, announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx, member_id, position, carnet_id, subject_kind, subject_id, icon, effort, created_at'

/** One task as it is stored: the one shape every reader starts from. */
export interface TaskRow {
  id: string
  kind: string | null
  title: string
  color: string | null
  at: number | null
  recur_json: string | null
  recur_from: string | null
  lead_seconds: number | null
  announce_evening: number | null
  last_done_at: number | null
  last_done_by: string | null
  cleared_at: number | null
  snoozed_until: number | null
  rotation_json: string
  current_idx: number
  member_id: string | null
  position: number
  carnet_id: string | null
  subject_kind: string | null
  subject_id: string | null
  icon: string | null
  effort: number | null
  created_at: number
}

/** Any stored row as a task, or null when it has left every list (a cleared one-off). */
export const taskOf = (r: TaskRow, today: number, now: number): TaskItem | null => spineTask(r, today, now)

const rowsOf = async (db: D1Database, where: string, ...binds: unknown[]): Promise<TaskRow[]> =>
  (await db.prepare(`SELECT ${TASK_COLS} FROM home_projects WHERE ${where}`).bind(...binds).all<TaskRow>()).results

// ── /api/board ─────────────────────────────────────────────────────────────────────────────

/** The board's rows: every task that has a date or a schedule, or was ticked today. An open
 *  undated one-off is someday business: it lives in the Tâches view, not on the poll. */
export const boardTaskRows = (db: D1Database, hh: string, today: number): Promise<TaskRow[]> =>
  rowsOf(db, 'household_id = ? AND (at IS NOT NULL OR recur_json IS NOT NULL OR last_done_at >= ?) ORDER BY rowid', hh, today)

/** The board's two task lists: the card (due, owed or ticked today) and « À venir ». */
export function boardTasks(rows: readonly TaskRow[], today: number, now: number): { tasks: TaskItem[]; tasksAhead: TaskItem[] } {
  const items = rows.map((r) => taskOf(r, today, now)).filter(present)
  return {
    tasks: items.filter((i) => i.onBoard),
    tasksAhead: items.filter((i) => aheadThisWeek(i, today)).sort((a, b) => (a.day ?? 0) - (b.day ?? 0)),
  }
}

// ── /api/tasks ─────────────────────────────────────────────────────────────────────────────

/** Every task (the Tâches view, a subject's page), and the projects « Sur quoi ? » can name. */
export async function allTasks(db: D1Database, hh: string, today: number, now: number, max: number): Promise<{ tasks: TaskItem[]; projects: TaskRow[] }> {
  // A one-off ticked on an earlier day has cleared (taskOf answers null): left out of the read.
  // Every term is a definite boolean, so an open row (last_done_at NULL) is never dropped.
  const rows = (
    await rowsOf(db, 'household_id = ? AND NOT (recur_json IS NULL AND last_done_at IS NOT NULL AND last_done_at < ?) ORDER BY created_at, position, rowid', hh, today)
  ).slice(0, max)
  return {
    tasks: rows.map((r) => taskOf(r, today, now)).filter(present),
    // What « Sur quoi ? » offers as a project. No axis says it alone: a note or a budget
    // forces a row onto the home face, but so does « à partir de la dernière fois », and an
    // entretien carries notes too. `kind = 'plan'` is the one thing a household said: the
    // « Nouveau projet » door writes it, and a task given a project's layers (notes, budget)
    // is written as one. So a to-do never becomes pickable by accident.
    projects: rows.filter((r) => kindOf(r.kind) === 'plan'),
  }
}

/** A subject's history: what was done, when, and by whom. Names and dates, never a count. */
export async function subjectHistory(db: D1Database, hh: string, ref: SubjectRef, max: number): Promise<TasksWire['history']> {
  // A carnet on a row may live in carnet_id (migration 0146) as well as in subject_kind/id.
  const match = (t: string) => `((${t}subject_kind = ? AND ${t}subject_id = ?) OR (? = 'carnet' AND ${t}carnet_id = ?))`
  const binds = [ref.kind, ref.id, ref.kind, ref.id]
  type Line = { id: string; title: string; at: number; who_id: string | null }
  const [logged, ticked] = await Promise.all([
    db
      .prepare(
        `SELECT t.id, t.title, tp.contributed_at AS at, tp.member_id AS who_id
           FROM task_participants tp
           JOIN home_projects t ON t.id = tp.task_id AND t.household_id = ?
          WHERE ${match('t.')}
          ORDER BY tp.contributed_at DESC LIMIT ?`,
      )
      .bind(hh, ...binds, max)
      .all<Line>(),
    rowsOf(db, `household_id = ? AND last_done_at IS NOT NULL AND ${match('')} ORDER BY last_done_at DESC LIMIT ?`, hh, ...binds, max),
  ])
  // A tick the log already holds (a chore's, written in the same batch) is one line, not two.
  const seen = new Set(logged.results.map((r) => `${r.id}:${r.at}`))
  const lines = [
    ...logged.results,
    ...ticked.filter((r) => !seen.has(`${r.id}:${r.last_done_at}`)).map((r) => ({ id: r.id, title: r.title, at: r.last_done_at as number, who_id: r.last_done_by ?? r.member_id })),
  ]
  return lines
    .map((r) => ({ key: `${r.id}:${r.at}`, title: r.title, at: r.at, who_id: r.who_id }))
    .sort((a, b) => b.at - a.at)
    .slice(0, max)
}

// ── The calendar: /api/month (and the day page, which reads one day of it), /api/year ──────

/** One occurrence of a task on a day. `id` is the occurrence (`<task>#<at>` for a series);
 *  `taskId` the row. `done`: a one-off that was ticked, which keeps its cell, struck. */
export interface TaskCell {
  id: string
  taskId: string
  source: TaskItem['source']
  title: string
  color: string | null
  icon: string | null
  kind: TaskItem['kind']
  who_id: string | null
  day: number
  done: boolean
  recurring: boolean
  /** Inside its calm « Bientôt » lead window right now. */
  soon: boolean
}

/** Every dated task: the rows a calendar reads. A recurrence with no start is undated (0152). */
export const datedTaskRows = (db: D1Database, hh: string): Promise<TaskRow[]> => rowsOf(db, 'household_id = ? AND at IS NOT NULL ORDER BY rowid', hh)

/** The open departure checklist instances in the window: not tasks, but the calendar's « À
 *  cocher » marker (a loose to-do is a task now, so it is a task cell like any other). */
export async function departureRows(db: D1Database, hh: string, from: number, to: number) {
  return (
    await db
      .prepare(
        todoRowsSql(
          'id, title, member_id, day, section',
          'WHERE (source_template_id IS NOT NULL OR section IS NOT NULL) AND day IS NOT NULL AND day >= ?2 AND day < ?3 AND done_at IS NULL ORDER BY day, position, created_at',
        ),
      )
      .bind(hh, from, to)
      .all<{ id: string; title: string; member_id: string | null; day: number; section: string | null }>()
  ).results
}

/** THE calendar rule: every occurrence of every dated task in [from, to). `includeDone`: a
 *  cell is a record of the day, so a completed one-off keeps it (struck). Whose turn rides
 *  along, the rotation projected per occurrence (the stored turn is the PENDING one's). */
export function cellsOf(rows: readonly TaskRow[], from: number, to: number, dayOf: (at: number) => number): TaskCell[] {
  const todayLocal = localDayStart(new Date())
  const now = Math.floor(Date.now() / 1000)
  const cells: TaskCell[] = []
  for (const r of rows) {
    const rule = parseRecur(r.recur_json)
    const team = parseRotation(r.rotation_json)
    const occs = upkeepOccurrences(r, from, to, { includeDone: true })
    const first = occs[0]
    // A turn that moves (two or more people on a series) is projected from the pending one.
    const anchor = effectiveAnchor(r)
    const refDay = r.last_done_at != null && r.last_done_at >= todayLocal ? addLocalDays(todayLocal, 1) : todayLocal
    let offset = rule && team.length > 1 && first !== undefined && anchor != null ? rotationOffset(anchor, rule, refDay, first) : 0
    for (const at of occs) {
      cells.push({
        id: rule ? `${r.id}#${at}` : r.id,
        taskId: r.id,
        source: faceOfKind(r.kind),
        title: r.title,
        color: r.color,
        icon: r.icon,
        kind: kindOf(r.kind),
        who_id: turnOf(team, r.current_idx + offset) ?? r.member_id,
        day: dayOf(at),
        done: !rule && r.last_done_at != null,
        recurring: rule != null,
        soon: isSoon(now, at, r.lead_seconds),
      })
      if (rule) offset++
    }
  }
  return cells
}

// ── « Cette semaine » ──────────────────────────────────────────────────────────────────────

/** The week ahead (open, next date before `weekEnd`) and the week behind (done since
 *  `weekStart`). The caller drops from `done` what its contribution log already names. */
export async function weekTasks(db: D1Database, hh: string, today: number, now: number, weekEnd: number, weekStart: number) {
  const rows = await rowsOf(db, 'household_id = ? AND (at IS NOT NULL OR (last_done_at >= ? AND last_done_at < ?)) ORDER BY rowid', hh, weekStart, today)
  const ahead = rows
    .map((r) => taskOf(r, today, now))
    .filter(present)
    .filter((i) => i.done === 'open' && i.day != null && i.day >= today && i.day < weekEnd)
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0))
    .map((i) => ({ title: i.title, at: i.day as number, color: i.color }))
  const done = rows
    .filter((r) => r.last_done_at != null && r.last_done_at >= weekStart && r.last_done_at < today)
    .map((r) => ({ id: r.id, title: r.title, color: r.color }))
  return { ahead, done }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────

/** The weekly recap's « done this week »: every task ticked since `since`. */
export async function recapTaskTitles(db: D1Database, hh: string, since: number): Promise<string[]> {
  return (await rowsOf(db, 'household_id = ? AND last_done_at >= ? ORDER BY rowid LIMIT 20', hh, since)).map((r) => r.title)
}

/** The house assistant's « tâches »: every open task's title, oldest first. */
export async function askTaskTitles(db: D1Database, hh: string, today: number, now: number): Promise<{ title: string }[]> {
  return (await rowsOf(db, 'household_id = ? ORDER BY created_at, rowid', hh))
    .map((r) => taskOf(r, today, now))
    .filter(present)
    .filter((i) => i.done === 'open')
    .slice(0, 30)
    .map((i) => ({ title: i.title }))
}
