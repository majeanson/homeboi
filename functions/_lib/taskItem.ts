import { parseRecur } from './recur'
import { choreSchedule, upkeepStatus, type UpkeepRowLike } from './upkeep'
import { isSoon } from './reminder'
import { parseRotation, turnOf } from './rotation'
import { subjectFromRow } from './subject'
import { taskEffort } from './validate'
import type { TaskItem } from './wire'

// A TASK, READ SIDE — one shape over every task row (plans/2026-11-06-TACHE-UNIFIEE.md). Since
// migration 0150 every task lives in ONE table, `home_projects` (« the spine »); this is what a
// row looks like to a reader, so the board, the Tâches view and a subject's page cannot each
// decide what « done » means.
//
// THE FACES. A spine row's `kind` says which payload it wears: 'chore' (the old `tasks`),
// 'todo' (the old loose `todos`), 'plan' / 'upkeep' (the old home rows). It is a reader's need,
// never a form's question: the board, the calendar, the day page and the three alias endpoints
// still speak those three shapes. Each face is read through its own SELECT below, aliased back
// into its old row shape, so every derivation downstream is the code that ran before the merge
// (worker/taskMerge.d1.test.ts holds the two equal). A reader names a face with these, never
// with a string of its own (`task-merge-rule.test.ts`).
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
  icon: string | null
  effort: number | null
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
    icon: s.icon,
    effort: s.effort,
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

/** Each face as a WHERE term on the spine (`home_projects`, the one table every task lives in since 0150). */
export const FACE = {
  chore: "kind = 'chore'",
  todo: "kind = 'todo'",
  home: "kind IN ('plan', 'upkeep')",
} as const
export type Face = keyof typeof FACE
/** The face a stored `kind` wears. */
export const faceOfKind = (kind: string | null | undefined): Face => (kind === 'chore' ? 'chore' : kind === 'todo' ? 'todo' : 'home')

// The columns each reader must SELECT for its face. Named here so a query cannot forget one.
// A chore's start lives in the spine's `at` (0150), read back under its old name: NULL still
// means « from created_at » (choreSchedule).
export const CHORE_TASK_COLS =
  'id, title, colour AS color, rotation_json, current_idx, last_done_at, cleared_at, recur_json, at AS recur_start, lead_seconds, subject_kind, subject_id, icon, effort, created_at'
export const HOME_TASK_COLS =
  'id, kind, title, colour AS color, at, recur_json, recur_from, lead_seconds, last_done_at, snoozed_until, cleared_at, rotation_json, current_idx, carnet_id, subject_kind, subject_id, icon, effort'

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
  icon: string | null
  effort: number | null
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
      icon: c.icon,
      effort: taskEffort(c.effort),
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
  icon: string | null
  effort: number | null
}

export function homeTask(h: HomeTaskRow, today: number, now: number): TaskItem | null {
  return fromSchedule(
    {
      source: 'home',
      id: h.id,
      title: h.title,
      color: h.color,
      icon: h.icon,
      effort: taskEffort(h.effort),
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
  icon?: string | null
  color?: string | null
  effort?: number | null
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
    color: td.color ?? null,
    icon: td.icon ?? null,
    effort: taskEffort(td.effort),
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

// EVERY TO-DO ROW, in the old `todos` shape: the loose ones from the spine's 'todo' face, the
// departure checklist instances from `todos`, which keeps them (they are not tasks). `todos` is
// read WHOLE, not only its departure rows: a loose row an old Worker wrote there during the
// minute between the migration and the deploy stays visible and editable through the alias,
// until a later migration moves it. `?1` is the household; the caller numbers its own binds
// from `?2`. `section` and `source_template_id` are NULL on the spine's side by construction.
export const todoRowsSql = (select: string, rest: string): string =>
  `WITH todo_rows AS (
     SELECT id, household_id, title, at AS day, member_id, last_done_at AS done_at, position, NULL AS section, NULL AS source_template_id,
            created_at, updated_at, subject_kind, subject_id, icon, colour, effort
       FROM home_projects WHERE household_id = ?1 AND kind = 'todo'
     UNION ALL
     SELECT id, household_id, title, day, member_id, done_at, position, section, source_template_id,
            created_at, updated_at, subject_kind, subject_id, icon, colour, effort
       FROM todos WHERE household_id = ?1
   )
   SELECT ${select} FROM todo_rows ${rest}`

// Deleting a task: its « qui a aidé » lines first. `task_participants.task_id` is a soft ref
// since 0150 (no FK to block or cascade), so nothing else would remove them; they are scoped
// through the task's own household guard, so a wrong household cannot wipe another's log.
// Any face: an id names one row, and every door that deletes a task (the aliases, /api/tasks,
// a capture's « Corriger ») may be handed any face's id since 0150.
export function deleteTaskStatements(db: D1Database, householdId: string, id: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM task_participants WHERE task_id IN (SELECT id FROM home_projects WHERE id = ? AND household_id = ?)').bind(id, householdId),
    db.prepare('DELETE FROM home_projects WHERE id = ? AND household_id = ?').bind(id, householdId),
  ]
}

// « Vider les cochés » on the faces whose rows are history (a chore, a home row): it stamps, it
// does not delete. A to-do's clear deletes, as it always has (/api/todos). D1 caps bound
// variables, so the ids go in slices (the todos clear does the same).
export function clearStatements(db: D1Database, face: 'chore' | 'home', householdId: string, ids: readonly string[], ts: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50)
    out.push(
      db
        .prepare(`UPDATE home_projects SET cleared_at = ? WHERE household_id = ? AND ${FACE[face]} AND id IN (${slice.map(() => '?').join(',')})`)
        .bind(ts, householdId, ...slice),
    )
  }
  return out
}
