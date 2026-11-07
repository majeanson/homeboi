import { parseRecur } from './recur'
import { choreSchedule, upkeepStatus, type UpkeepRowLike } from './upkeep'
import { isSoon } from './reminder'
import { parseRotation, turnOf } from './rotation'
import { subjectFromRow } from './subject'
import type { TaskItem } from './wire'

// A TASK, READ SIDE — one shape over the three tables (plans/2026-11-06-TACHE-UNIFIEE.md). The
// rows stay in `tasks`, `todos` and `home_projects`; this is what they look like to a reader,
// so the board, the Tâches view and a subject's page cannot each decide what « done » means.
//
// DONE MEANS ONE THING PER CASE, and the case is the schedule, never the table:
//   · a ONE-OFF is checked on a day. It stays ticked until that day ends, then it has cleared
//     by itself. Nothing rewrites the row and no cron runs: the clear is this comparison, on
//     read, the house rule of _lib/recur.ts. « Effacer les cochées » clears it sooner.
//   · a RECURRING task is never « done »: a check moves it to its next date. It reads open,
//     with `doneAt` saying when it last happened.
// `today` is a local midnight, and `doneAt` is the real moment of the tick, not the moment
// it reached the server (`tickedAt`, _lib/ids), so an offline tick replayed after midnight
// keeps its own day and has simply already cleared.
//
// DEPARTURE CHECKLIST INSTANCES ARE NOT TASKS. They share the `todos` table and nothing else:
// they are swept by day, they fold under their list, and the departure card owns them.
// `isLooseTodo` is the server's half of `splitTodos` (src/lib/todos.ts), and it is the same
// test: a row with a template or a section is a checklist row.

export const isLooseTodo = (r: { source_template_id: string | null; section: string | null }): boolean =>
  r.source_template_id == null && r.section == null

const clearedByDay = (doneAt: number, today: number): boolean => doneAt < today

// null = this one-off is finished business: it has left every list and lives on as history.
function oneOffDone(doneAt: number | null, clearedAt: number | null | undefined, today: number): 'open' | 'ticked' | null {
  if (doneAt == null) return 'open'
  if (clearedByDay(doneAt, today)) return null
  return clearedAt != null && clearedAt >= doneAt ? null : 'ticked'
}

// What the bento board shows: due, owed, or ticked today. Someday and later live in the
// Tâches view. One predicate, stamped on the item, so the client never re-derives it.
const onBoardNow = (i: Pick<TaskItem, 'done' | 'dueToday' | 'overdueSince'>): boolean =>
  i.done === 'ticked' || i.dueToday || i.overdueSince != null

interface Scheduled {
  source: TaskItem['source']
  id: string
  title: string
  color: string | null
  ref: ReturnType<typeof subjectFromRow>
  schedule: UpkeepRowLike
  lead: number | null | undefined
  clearedAt: number | null | undefined
  rotation: string[]
  idx: number
  kind: TaskItem['kind']
}

function fromSchedule(s: Scheduled, today: number, now: number): TaskItem | null {
  const recurring = parseRecur(s.schedule.recur_json) != null
  const doneAt = s.schedule.last_done_at
  const done = recurring ? 'open' : oneOffDone(doneAt, s.clearedAt, today)
  if (done === null) return null
  const st = upkeepStatus(s.schedule, today)
  const day = st.nextAt
  const item = {
    key: `${s.source}:${s.id}`,
    source: s.source,
    id: s.id,
    title: s.title,
    color: s.color,
    subject: s.ref,
    kind: s.kind,
    recurring,
    recurJson: s.schedule.recur_json,
    day,
    dueToday: st.dueToday,
    overdueSince: st.overdueSince,
    snoozedUntil: st.snoozedUntil,
    soon: day != null ? isSoon(now, day, s.lead) : false,
    done,
    doneAt,
    who_id: turnOf(s.rotation, s.idx),
    team: s.rotation,
  }
  return { ...item, onBoard: onBoardNow(item) }
}

// The columns each reader must SELECT for its table. Named here so a query cannot forget one.
export const CHORE_TASK_COLS =
  'id, title, colour AS color, rotation_json, current_idx, last_done_at, cleared_at, recur_json, recur_start, lead_seconds, subject_kind, subject_id, created_at'
export const HOME_TASK_COLS =
  'id, kind, title, colour AS color, at, recur_json, recur_from, lead_seconds, last_done_at, snoozed_until, cleared_at, rotation_json, current_idx, carnet_id, subject_kind, subject_id'

export interface ChoreTaskRow {
  id: string
  title: string
  color: string | null
  rotation_json: string
  current_idx: number
  last_done_at: number | null
  cleared_at: number | null
  recur_json: string | null
  recur_start: number | null
  lead_seconds: number | null
  subject_kind: string | null
  subject_id: string | null
  created_at: number
}

export function choreTask(c: ChoreTaskRow, today: number, now: number): TaskItem | null {
  const recurring = parseRecur(c.recur_json) != null
  return fromSchedule(
    {
      source: 'chore',
      id: c.id,
      title: c.title,
      color: c.color,
      ref: subjectFromRow(c),
      // A one-off chore has no date unless one was chosen. choreSchedule's created_at
      // fallback is a RECURRENCE anchor: used here, every undated chore would be overdue.
      schedule: recurring ? choreSchedule(c) : { at: c.recur_start, recur_json: null, last_done_at: c.last_done_at },
      lead: c.lead_seconds,
      clearedAt: c.cleared_at,
      rotation: parseRotation(c.rotation_json),
      idx: c.current_idx,
      kind: null,
    },
    today,
    now,
  )
}

export interface HomeTaskRow extends UpkeepRowLike {
  id: string
  kind: string
  title: string
  color: string | null
  lead_seconds: number | null
  cleared_at: number | null
  rotation_json: string
  current_idx: number
  carnet_id: string | null
  subject_kind: string | null
  subject_id: string | null
}

export function homeTask(h: HomeTaskRow, today: number, now: number): TaskItem | null {
  return fromSchedule(
    {
      source: 'home',
      id: h.id,
      title: h.title,
      color: h.color,
      ref: subjectFromRow(h),
      schedule: h,
      lead: h.lead_seconds,
      clearedAt: h.cleared_at,
      rotation: parseRotation(h.rotation_json),
      idx: h.current_idx,
      kind: h.kind === 'upkeep' ? 'upkeep' : 'plan',
    },
    today,
    now,
  )
}

export interface TodoTaskRow {
  id: string
  title: string
  day: number | null
  member_id: string | null
  done_at: number | null
  section: string | null
  source_template_id: string | null
  subject_kind?: string | null
  subject_id?: string | null
}

// A departure instance answers null: it is not a task (see the header).
export function todoTask(td: TodoTaskRow, today: number): TaskItem | null {
  if (!isLooseTodo(td)) return null
  const done = oneOffDone(td.done_at, null, today)
  if (done === null) return null
  const open = done === 'open'
  const item = {
    key: `todo:${td.id}`,
    source: 'todo' as const,
    id: td.id,
    title: td.title,
    color: null,
    subject: subjectFromRow(td),
    kind: null,
    recurring: false,
    recurJson: null,
    day: td.day,
    dueToday: open && td.day === today,
    overdueSince: open && td.day != null && td.day < today ? td.day : null,
    snoozedUntil: null,
    soon: false,
    done,
    doneAt: td.done_at,
    who_id: td.member_id,
    team: [],
  }
  return { ...item, onBoard: onBoardNow(item) }
}

export const present = (x: TaskItem | null): x is TaskItem => x != null

// « Vider les cochés » on the two tables whose rows are history: it stamps, it does not
// delete. D1 caps bound variables, so the ids go in slices (the todos clear does the same).
export function clearStatements(db: D1Database, table: 'tasks' | 'home_projects', householdId: string, ids: readonly string[], ts: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50)
    out.push(db.prepare(`UPDATE ${table} SET cleared_at = ? WHERE household_id = ? AND id IN (${slice.map(() => '?').join(',')})`).bind(ts, householdId, ...slice))
  }
  return out
}
