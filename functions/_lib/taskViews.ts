import { parseRecur, rotationOffset } from './recur'
import { choreSchedule, upkeepOccurrences, upkeepStatus } from './upkeep'
import { isSoon } from './reminder'
import { parseRotation, turnOf } from './rotation'
import { localDayStart } from './ids'
import { FACE, choreTask, faceOfKind, homeTask, present, todoRowsSql, todoTask, type ChoreTaskRow, type Face, type HomeTaskRow, type TodoTaskRow } from './taskItem'
import type { SubjectRef } from './subject'
import type { BoardChore, BoardChoreInstance, BoardHomeInstance, BoardHomeOverdue, TaskItem, TasksWire } from './wire'

// EVERY READER OF A TASK READS IT HERE (plans/2026-11-06-TACHE-UNIFIEE.md, « retire the faces »).
//
// One row shape, `TaskRow`, read with one column list, `TASK_COLS`, from the one table every
// task lives in since 0150 (`home_projects`, the spine). A reader — the board, the calendar,
// the year, « Cette semaine », the recap, the house assistant, the Tâches view — asks this file
// for what it shows, and gets it back already shaped. No reader outside this file and
// `_lib/taskItem.ts` names a face (`task-faces-rule.test.ts`).
//
// WHY THE FACES ARE STILL HERE. `kind` keeps 'chore' and 'todo' beside 'plan' and 'upkeep',
// and the views below still read it, because what a household SEES still differs by face, and
// the rewrite was held to « nothing visible changes » (worker/taskReaders.d1.test.ts pins every
// answer). Each divergence is a product rule the owner has not chosen yet, listed once:
//
//   view                     chore                    home (plan/upkeep)          todo
//   board « Aujourd'hui »    recurring, due today     due today (any schedule)    (its own poll)
//   board one-off list       every open one-off,      —                           —
//                            whatever its date
//   board « À venir »        not occurring today,     not due today, next within  —
//                            next within the week     the week (snoozed: its day)
//   board carry-forward      none                     owed since a missed date    —
//   month / day page         recurring only, every    dated only, every           dated and OPEN only
//                            occurrence, rotation     occurrence, a ticked
//                            projected per cell       one-off keeps its cell
//   year                     never                    dated: every occurrence     never
//   « Cette semaine »        (its contribution log)   dated this week, done       never
//                                                     the week before
//   recap / assistant        chore titles only        never                       never
//   a subject's history      the contribution log     the last completion         done before today
//   « Sur quoi ? » subjects  never                   kind = 'plan' only          never
//
// And the stored `at` is read three ways (0150's header): a chore's is the chosen start of its
// recurrence, NULL = from created_at; a to-do's is a local midnight; a home row's is its
// anchor. `scheduleOf` is where that is decided, once. When the owner picks one rule per line
// above, `kind` can shrink back to `plan | upkeep | null` (STATE.md §3 carries the proposal).

/** Every column a reader of a task needs, in its stored name but for `colour AS color`. */
export const TASK_COLS =
  'id, kind, title, colour AS color, at, recur_json, recur_from, lead_seconds, announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx, member_id, position, carnet_id, subject_kind, subject_id, icon, effort, created_at'

/** One task as it is stored: the one shape every reader starts from. */
export interface TaskRow {
  id: string
  kind: string
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

const faceOf = (r: Pick<TaskRow, 'kind'>): Face => faceOfKind(r.kind)

// The old row shapes, read off the one row. Each face's derivation below is the code that ran
// before, unchanged, so the snapshot test compares like with like.
const asChore = (r: TaskRow): ChoreTaskRow => ({
  id: r.id,
  title: r.title,
  color: r.color,
  rotation_json: r.rotation_json,
  current_idx: r.current_idx,
  last_done_at: r.last_done_at,
  cleared_at: r.cleared_at,
  recur_json: r.recur_json,
  recur_start: r.at,
  lead_seconds: r.lead_seconds,
  subject_kind: r.subject_kind,
  subject_id: r.subject_id,
  icon: r.icon,
  effort: r.effort,
  created_at: r.created_at,
})
const asHome = (r: TaskRow): HomeTaskRow => r
const asTodo = (r: TaskRow): TodoTaskRow => ({
  id: r.id,
  title: r.title,
  day: r.at,
  member_id: r.member_id,
  done_at: r.last_done_at,
  section: null,
  source_template_id: null,
  subject_kind: r.subject_kind,
  subject_id: r.subject_id,
  icon: r.icon,
  color: r.color,
  effort: r.effort,
})

/** The ONE reading of a stored schedule: a chore's NULL start runs from created_at (0032). */
export const scheduleOf = (r: TaskRow) => (faceOf(r) === 'chore' ? choreSchedule(asChore(r)) : r)

/** Any stored row as a task, or null when it has left every list (a cleared one-off). */
export function taskOf(r: TaskRow, today: number, now: number): TaskItem | null {
  const face = faceOf(r)
  if (face === 'chore') return choreTask(asChore(r), today, now)
  if (face === 'todo') return todoTask(asTodo(r), today)
  return homeTask(asHome(r), today, now)
}

const rowsOf = async (db: D1Database, where: string, ...binds: unknown[]): Promise<TaskRow[]> =>
  (await db.prepare(`SELECT ${TASK_COLS} FROM home_projects WHERE ${where}`).bind(...binds).all<TaskRow>()).results

// Stable: a tie keeps the order the rows were read in.
const byCreated = (rows: TaskRow[]): TaskRow[] => [...rows].sort((a, b) => a.created_at - b.created_at)

// ── /api/board ─────────────────────────────────────────────────────────────────────────────

export interface BoardTaskFields {
  chores: BoardChore[]
  choresToday: BoardChoreInstance[]
  choresUpcoming: BoardChoreInstance[]
  todos: BoardChoreInstance[]
  homeToday: BoardHomeInstance[]
  homeUpcoming: BoardHomeInstance[]
  homeOverdue: BoardHomeOverdue[]
  tasks: TaskItem[]
}

/** The board's rows: every chore, and the home rows that can show (dated, or ticked today). */
export const boardTaskRows = (db: D1Database, hh: string, today: number): Promise<TaskRow[]> =>
  rowsOf(db, `household_id = ? AND (${FACE.chore} OR (${FACE.home} AND (at IS NOT NULL OR last_done_at >= ?))) ORDER BY rowid`, hh, today)

export function boardTaskFields(
  rows: readonly TaskRow[],
  o: {
    today: number
    tomorrow: number
    weekEnd: number
    now: number
    memberName: (id: string | null) => string | null
    helpers: (taskId: string) => { name: string | null; role: string }[]
  },
): BoardTaskFields {
  const { today, tomorrow, weekEnd, now, memberName } = o
  const chores = byCreated(rows.filter((r) => faceOf(r) === 'chore'))
  const homes = rows.filter((r) => faceOf(r) === 'home')

  const choresOut = chores.map((c) => ({
    id: c.id,
    title: c.title,
    rotation_json: c.rotation_json,
    current_idx: c.current_idx,
    last_done_at: c.last_done_at,
    color: c.color,
    recur_json: c.recur_json,
    recur_start: c.at,
    lead_seconds: c.lead_seconds,
    announce_evening: c.announce_evening,
    created_at: c.created_at,
    helpers: o.helpers(c.id),
  }))

  // Recurring chores expanded onto the day: those that occur TODAY (and aren't already done
  // today) surface on Aujourd'hui; otherwise the next occurrence in the week surfaces on À
  // venir. Whose turn rides along. A one-off chore has no schedule here: it surfaces as a
  // to-do until it is checked off, whatever its date.
  const choresToday: BoardChoreInstance[] = []
  const choresUpcoming: BoardChoreInstance[] = []
  const todos: BoardChoreInstance[] = []
  for (const c of chores) {
    const r = parseRecur(c.recur_json)
    const team = parseRotation(c.rotation_json)
    const turn = turnOf(team, c.current_idx)
    const inst = (at: number): BoardChoreInstance => ({
      id: c.id,
      title: c.title,
      color: c.color,
      at,
      soon: isSoon(now, at, c.lead_seconds),
      who: memberName(turn),
      who_id: turn,
      team,
      announce_evening: c.announce_evening === 1,
    })
    if (!r) {
      if (c.last_done_at == null) todos.push(inst(today))
      continue
    }
    const schedule = scheduleOf(c)
    if (upkeepOccurrences(schedule, today, tomorrow).length > 0) {
      const doneToday = c.last_done_at != null && c.last_done_at >= today
      if (!doneToday) choresToday.push(inst(today))
    } else {
      const next = upkeepOccurrences(schedule, tomorrow, weekEnd)[0]
      if (next != null) choresUpcoming.push(inst(next))
    }
  }
  choresUpcoming.sort((a, b) => a.at - b.at)

  // Home rows: due today on Aujourd'hui; a snoozed one previews on À venir only on its return
  // day; a missed date waits on « À faire » until checked (derived by _lib/upkeep, never a row).
  const homeToday: BoardHomeInstance[] = []
  const homeUpcoming: BoardHomeInstance[] = []
  const homeOverdue: BoardHomeOverdue[] = []
  for (const h of homes) {
    const team = parseRotation(h.rotation_json)
    const turn = turnOf(team, h.current_idx)
    const hinst = (at: number): BoardHomeInstance => ({
      id: h.id,
      title: h.title,
      color: h.color,
      at,
      soon: isSoon(now, at, h.lead_seconds),
      who: memberName(turn),
      who_id: turn,
      team,
      carnet_id: h.carnet_id,
      recurring: parseRecur(h.recur_json) != null,
    })
    const st = upkeepStatus(h, today)
    if (st.dueToday) homeToday.push(hinst(today))
    else if (st.snoozedUntil != null) {
      if (st.nextAt != null && st.nextAt >= tomorrow && st.nextAt < weekEnd) homeUpcoming.push(hinst(st.nextAt))
    } else {
      const next = upkeepOccurrences(h, tomorrow, weekEnd)[0]
      if (next != null) homeUpcoming.push(hinst(next))
    }
    // Suppressed while due today: checking today's occurrence covers the missed one too.
    if (st.overdueSince != null && !st.dueToday) homeOverdue.push({ ...hinst(st.overdueSince), overdueSince: st.overdueSince })
  }
  homeUpcoming.sort((a, b) => a.at - b.at)
  homeOverdue.sort((a, b) => a.overdueSince - b.overdueSince)

  // The merged board section: due, owed or ticked today. To-dos ride /api/todos, their own poll.
  const tasks = [...homes, ...chores]
    .map((r) => taskOf(r, today, now))
    .filter(present)
    .filter((i) => i.onBoard)

  return { chores: choresOut, choresToday, choresUpcoming, todos, homeToday, homeUpcoming, homeOverdue, tasks }
}

// ── /api/tasks ─────────────────────────────────────────────────────────────────────────────

const FACE_ORDER: readonly Face[] = ['home', 'chore', 'todo']

/** Every task (the Tâches view, a subject's page), and the projects « Sur quoi ? » can name. */
export async function allTasks(db: D1Database, hh: string, today: number, now: number, perFace: number): Promise<{ tasks: TaskItem[]; projects: TaskRow[] }> {
  // A to-do whose day has cleared it stays out of the read; the other faces clear on read.
  const rows = await rowsOf(db, `household_id = ? AND NOT (${FACE.todo} AND last_done_at IS NOT NULL AND last_done_at < ?) ORDER BY created_at, position, rowid`, hh, today)
  const by = (face: Face) => rows.filter((r) => faceOf(r) === face).slice(0, perFace)
  return {
    tasks: FACE_ORDER.flatMap((face) => by(face).map((r) => taskOf(r, today, now))).filter(present),
    // Only a PROJECT is a subject: a chore or a to-do must not become one by changing face.
    projects: by('home').filter((r) => r.kind === 'plan'),
  }
}

/** A subject's history: what was done, when, and by whom. Names and dates, never a count. */
export async function subjectHistory(db: D1Database, hh: string, ref: SubjectRef, today: number, max: number): Promise<TasksWire['history']> {
  // A carnet on a home row lives in carnet_id (migration 0146).
  const homeMatch = ref.kind === 'carnet' ? 'carnet_id = ?' : 'subject_kind = ? AND subject_id = ?'
  const homeBinds = ref.kind === 'carnet' ? [ref.id] : [ref.kind, ref.id]
  type Line = { id: string; title: string; at: number; who_id: string | null }
  const [chores, homes, todos] = await Promise.all([
    db
      .prepare(
        `SELECT t.id, t.title, tp.contributed_at AS at, tp.member_id AS who_id
           FROM task_participants tp
           JOIN home_projects t ON t.id = tp.task_id AND t.household_id = ? AND t.${FACE.chore}
          WHERE t.subject_kind = ? AND t.subject_id = ?
          ORDER BY tp.contributed_at DESC LIMIT ?`,
      )
      .bind(hh, ref.kind, ref.id, max)
      .all<Line>(),
    rowsOf(db, `household_id = ? AND ${FACE.home} AND last_done_at IS NOT NULL AND ${homeMatch} ORDER BY last_done_at DESC LIMIT ?`, hh, ...homeBinds, max),
    db
      .prepare(
        todoRowsSql(
          'id, title, done_at AS at, member_id AS who_id',
          'WHERE subject_kind = ?2 AND subject_id = ?3 AND done_at IS NOT NULL AND done_at < ?4 ORDER BY done_at DESC LIMIT ?5',
        ),
      )
      .bind(hh, ref.kind, ref.id, today, max)
      .all<Line>(),
  ])
  const line = (source: string) => (r: Line) => ({ key: `${source}:${r.id}:${r.at}`, title: r.title, at: r.at, who_id: r.who_id })
  return [...chores.results.map(line('chore')), ...homes.map((r) => line('home')({ id: r.id, title: r.title, at: r.last_done_at as number, who_id: r.last_done_by })), ...todos.results.map(line('todo'))]
    .sort((a, b) => b.at - a.at)
    .slice(0, max)
}

// ── /api/month (and the day page, which reads one day of it) ──────────────────────────────

export interface MonthTaskCells {
  chores: { id: string; title: string; color: string | null; who: string | null; day: number }[]
  homeProjects: { id: string; kind: string; title: string; color: string | null; day: number }[]
  todos: { id: string; title: string; member_id: string | null; day: number; section: string | null }[]
}

export interface MonthTaskReads {
  rows: TaskRow[]
  todoRows: MonthTaskCells['todos']
}

/** The month's two reads, run beside the handler's other queries. */
export async function monthTaskReads(db: D1Database, hh: string, from: number, to: number): Promise<MonthTaskReads> {
  const [rows, todoRows] = await Promise.all([
    rowsOf(db, `household_id = ? AND (${FACE.chore} OR (${FACE.home} AND at IS NOT NULL)) ORDER BY rowid`, hh),
    // Dated to-dos, open ones only, with the departure instances (todoRowsSql): `day` is
    // already a local midnight, so the range matches directly.
    db
      .prepare(todoRowsSql('id, title, member_id, day, section', 'WHERE day IS NOT NULL AND day >= ?2 AND day < ?3 AND done_at IS NULL ORDER BY day, position, created_at'))
      .bind(hh, from, to)
      .all<{ id: string; title: string; member_id: string | null; day: number; section: string | null }>(),
  ])
  return { rows, todoRows: todoRows.results }
}

export function monthTaskCells(
  { rows, todoRows }: MonthTaskReads,
  from: number,
  to: number,
  o: { dayOf: (at: number) => number; inRange: (day: number) => boolean; nameOf: (id: string | null) => string | null },
): MonthTaskCells {
  const DAY = 86400

  // Recurring chores across the window. The rotation's stored current_idx is the holder of the
  // next PENDING occurrence, so it is PROJECTED forward per occurrence. A one-off chore never
  // lands on the calendar.
  const todayLocal = localDayStart(new Date())
  const chores: MonthTaskCells['chores'] = []
  for (const c of rows.filter((r) => faceOf(r) === 'chore')) {
    const r = parseRecur(c.recur_json)
    if (!r) continue
    const schedule = scheduleOf(c)
    const rot = parseRotation(c.rotation_json)
    const refDay = c.last_done_at != null && c.last_done_at >= todayLocal ? todayLocal + DAY : todayLocal
    const occs = upkeepOccurrences(schedule, from, to, { includeDone: true })
    const firstOcc = occs[0]
    let offset = firstOcc !== undefined ? rotationOffset(schedule.at as number, r, refDay, firstOcc) : 0
    for (const at of occs) {
      chores.push({ id: `${c.id}#${at}`, title: c.title, color: c.color, who: o.nameOf(turnOf(rot, c.current_idx + offset)), day: o.dayOf(at) })
      offset++
    }
  }

  // Home rows across the window: recurring through the shared expander, a one-off on its day.
  // includeDone: a calendar cell is a record of the day, so a completed one-off keeps it.
  const homeProjects: MonthTaskCells['homeProjects'] = []
  for (const h of rows.filter((r) => faceOf(r) === 'home')) {
    const recurring = parseRecur(h.recur_json) != null
    for (const at of upkeepOccurrences(h, from, to, { includeDone: true })) {
      homeProjects.push({ id: recurring ? `${h.id}#${at}` : h.id, kind: h.kind, title: h.title, color: h.color, day: o.dayOf(at) })
    }
  }

  const todos: MonthTaskCells['todos'] = []
  for (const td of todoRows) if (o.inRange(td.day)) todos.push({ id: td.id, title: td.title, member_id: td.member_id, day: td.day, section: td.section })

  return { chores, homeProjects, todos }
}

// ── /api/year ──────────────────────────────────────────────────────────────────────────────

/** Every occurrence of a dated home row in the window (a ticked one-off keeps its marker). */
export async function yearTaskCells(db: D1Database, hh: string, from: number, to: number, dayOf: (at: number) => number) {
  const rows = await rowsOf(db, `household_id = ? AND ${FACE.home} AND at IS NOT NULL ORDER BY rowid`, hh)
  const upkeep: { id: string; kind: string; title: string; color: string | null; day: number }[] = []
  for (const h of rows) {
    const recurring = parseRecur(h.recur_json) != null
    for (const at of upkeepOccurrences(h, from, to, { includeDone: true })) {
      upkeep.push({ id: recurring ? `${h.id}#${at}` : h.id, kind: h.kind, title: h.title, color: h.color, day: dayOf(at) })
    }
  }
  return upkeep
}

// ── « Cette semaine » ──────────────────────────────────────────────────────────────────────

/** Home rows dated in the week ahead, and the ones done in the week behind. */
export async function weekTasks(db: D1Database, hh: string, today: number, weekEnd: number, weekStart: number) {
  const rows = await rowsOf(
    db,
    `household_id = ? AND ${FACE.home} AND ((at >= ? AND at < ?) OR (last_done_at >= ? AND last_done_at < ?)) ORDER BY rowid`,
    hh,
    today,
    weekEnd,
    weekStart,
    today,
  )
  return {
    ahead: rows
      .filter((p) => p.at != null && p.at >= today && p.at < weekEnd)
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
      .map((p) => ({ title: p.title, at: p.at as number, color: p.color })),
    done: rows.filter((p) => p.last_done_at != null && p.last_done_at >= weekStart && p.last_done_at < today).map((p) => ({ title: p.title, color: p.color })),
  }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────

/** The weekly recap's « done this week »: chore titles. */
export async function recapTaskTitles(db: D1Database, hh: string, since: number): Promise<string[]> {
  return (await rowsOf(db, `household_id = ? AND ${FACE.chore} AND last_done_at >= ? ORDER BY rowid LIMIT 20`, hh, since)).map((r) => r.title)
}

/** The house assistant's « tâches »: chore titles, oldest first. */
export async function askTaskTitles(db: D1Database, hh: string): Promise<{ title: string }[]> {
  return (await rowsOf(db, `household_id = ? AND ${FACE.chore} ORDER BY created_at LIMIT 30`, hh)).map((r) => ({ title: r.title }))
}
