import { parseRecur } from './recur'
import { upkeepStatus, type UpkeepRowLike } from './upkeep'
import { isSoon } from './reminder'
import { addLocalDays } from './ids'
import { parseRotation, turnOf } from './rotation'
import { subjectFromRow } from './subject'
import { taskEffort } from './validate'
import type { TaskItem } from './wire'

// A TASK, READ SIDE — one shape over every task row (plans/2026-11-06-TACHE-UNIFIEE.md). Since
// migration 0150 every task lives in ONE table, `home_projects` (« the spine »); this is what a
// row looks like to a reader, so the board, the Tâches view and a subject's page cannot each
// decide what « done » means. A READER does not come here: it reads one row shape through
// _lib/taskViews.ts, which hands it to `spineTask`, the one builder.
//
// TWO FACES, AND NEITHER IS A TYPE (0153). `kind` says what a home row IS ('plan', 'upkeep'),
// a behaviour some surfaces still ask about (the season card, a project's notes and budget,
// « Sur quoi ? », « Reporter »). Every other task has no kind: what used to be a chore and
// what used to be a loose to-do are one thing now, with one tick, one « Vider » and one day
// encoding (_lib/taskGestures, _lib/taskDay), and no reader or writer may tell them apart
// (`task-faces-rule.test.ts`).
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
// DEPARTURE CHECKLIST INSTANCES ARE NOT TASKS. They live in `todos` and nothing else: they are
// swept by day, they fold under their list, and the departure card owns them.

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

/** What a reader shows of a stored `kind`: an entretien, a plan, or neither. Anything else
 *  (a value no writer makes since 0153's CHECK) reads as a plain task. */
export const kindOf = (kind: string | null | undefined): TaskItem['kind'] => (kind === 'upkeep' ? 'upkeep' : kind === 'plan' ? 'plan' : null)

/** The two things a spine row can be to its doors, each as a WHERE term: a TASK (kind NULL,
 *  0153) or a HOME row (a project or an entretien). */
export const FACE = {
  task: 'kind IS NULL',
  home: "kind IN ('plan', 'upkeep')",
} as const
export type Face = keyof typeof FACE
/** The face a stored `kind` wears: a home row, or a task. */
export const faceOfKind = (kind: string | null | undefined): Face => (kindOf(kind) == null ? 'task' : 'home')

/** « À venir »: open, and its next date falls in the six days after today. One rule for every
 *  task: the board's À venir and its « annoncer la veille » line both read it. */
export const aheadThisWeek = (i: Pick<TaskItem, 'done' | 'day'>, today: number): boolean =>
  i.done === 'open' && i.day != null && i.day >= addLocalDays(today, 1) && i.day < addLocalDays(today, 7)

/** A spine row as it is stored (0150): every column a task's answers are read from. Its `at`
 *  is the task's day, decoded (_lib/taskDay: the readers hand rows over through it). */
export interface SpineTaskRow extends UpkeepRowLike {
  id: string
  kind: string | null
  title: string
  color: string | null
  lead_seconds: number | null
  announce_evening: number | null
  cleared_at: number | null
  rotation_json: string
  current_idx: number
  member_id: string | null
  carnet_id: string | null
  subject_kind: string | null
  subject_id: string | null
  icon: string | null
  effort: number | null
}

/** ANY spine row as a task, or null once a one-off has cleared: THE builder every reader uses
 *  (_lib/taskViews). Each answer is read off the row's AXES (a date? a recurrence? a tick? a
 *  rotation?), never off what it used to be. */
export function spineTask(r: SpineTaskRow, today: number, now: number): TaskItem | null {
  const source = faceOfKind(r.kind)
  const recurring = parseRecur(r.recur_json) != null
  const doneAt = r.last_done_at
  const done = recurring ? 'open' : oneOffDone(doneAt, r.cleared_at, today)
  if (done === null) return null
  const st = upkeepStatus(r, today)
  const day = st.nextAt
  const rotation = parseRotation(r.rotation_json)
  const item = {
    key: `${source}:${r.id}`,
    source,
    id: r.id,
    title: r.title,
    color: r.color,
    icon: r.icon,
    effort: taskEffort(r.effort),
    subject: subjectFromRow(r),
    kind: kindOf(r.kind),
    recurring,
    // A recurrence `parseRecur` refuses is no recurrence: the task is a one-off, and says so.
    recurJson: recurring ? r.recur_json : null,
    day,
    dueToday: st.dueToday,
    overdueSince: st.overdueSince,
    snoozedUntil: st.snoozedUntil,
    soon: day != null ? isSoon(now, day, r.lead_seconds) : false,
    done,
    doneAt,
    // Whose turn, else the task's author (who wrote it), else nobody.
    who_id: turnOf(rotation, r.current_idx) ?? r.member_id ?? null,
    team: rotation,
    announceEvening: r.announce_evening === 1,
  }
  return { ...item, onBoard: onBoardNow(item) }
}

export const present = (x: TaskItem | null): x is TaskItem => x != null

// EVERY CHECK-OFF ROW, in the old `todos` shape: the plain tasks from the spine, the departure
// checklist instances from `todos`, which keeps them (they are not tasks). `todos` is read
// WHOLE, not only its departure rows: a loose row an old Worker wrote there during a deploy
// window stays visible and editable through the alias. `?1` is the household; the caller
// numbers its own binds from `?2`. `section` and `source_template_id` are NULL on the spine's
// side by construction.
export const todoRowsSql = (select: string, rest: string): string =>
  `WITH todo_rows AS (
     SELECT id, household_id, title, at AS day, member_id, last_done_at AS done_at, position, NULL AS section, NULL AS source_template_id,
            created_at, updated_at, subject_kind, subject_id, icon, colour, effort
       FROM home_projects WHERE household_id = ?1 AND ${FACE.task}
     UNION ALL
     SELECT id, household_id, title, day, member_id, done_at, position, section, source_template_id,
            created_at, updated_at, subject_kind, subject_id, icon, colour, effort
       FROM todos WHERE household_id = ?1
   )
   SELECT ${select} FROM todo_rows ${rest}`

// Deleting a task: its « qui a aidé » lines first. `task_participants.task_id` is a soft ref
// since 0150 (no FK to block or cascade), so nothing else would remove them; they are scoped
// through the task's own household guard, so a wrong household cannot wipe another's log.
export function deleteTaskStatements(db: D1Database, householdId: string, id: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM task_participants WHERE task_id IN (SELECT id FROM home_projects WHERE id = ? AND household_id = ?)').bind(id, householdId),
    db.prepare('DELETE FROM home_projects WHERE id = ? AND household_id = ?').bind(id, householdId),
  ]
}
