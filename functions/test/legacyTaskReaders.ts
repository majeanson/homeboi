import { parseRecur } from '../_lib/recur'
import { choreSchedule, type UpkeepRowLike } from '../_lib/upkeep'
import { spineTask } from '../_lib/taskItem'
import type { TaskItem } from '../_lib/wire'

// THE READERS AS THEY WERE, for the drills that replay an old migration (worker/taskMerge,
// worker/taskStart) and for the rules of done (taskItem.test). Before 0153 each face had its
// own builder over its old row shape (a chore, a home row, a loose to-do); the Worker has one
// now (`spineTask`) and no reader may tell a former chore from a former to-do
// (task-faces-rule.test.ts). These map an OLD row onto the one builder exactly the way the old
// builders read it, so a drill can still say « the same task before and after ». Test-only:
// nothing under functions/api or functions/_lib may import this file.

export const isLooseTodo = (r: { source_template_id: string | null; section: string | null }): boolean => r.source_template_id == null && r.section == null

const base = {
  recur_from: 'anchor',
  snoozed_until: null,
  carnet_id: null,
  member_id: null,
  announce_evening: null,
  lead_seconds: null,
  cleared_at: null,
  rotation_json: '[]',
  current_idx: 0,
  subject_kind: null,
  subject_id: null,
  icon: null,
  effort: null,
}

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
  announce_evening?: number | null
}

// A chore: a recurrence counts from its start, else from created_at (0032); a one-off has a
// date only if one was chosen. No author: who is the rotation alone.
export function choreTask(c: ChoreTaskRow, today: number, now: number): TaskItem | null {
  const recurring = parseRecur(c.recur_json) != null
  const at = recurring ? choreSchedule(c).at : c.recur_start
  return spineTask({ ...base, ...c, kind: null, at, announce_evening: c.announce_evening ?? null, member_id: null }, today, now)
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

// A home row: never announced the evening before, never an author.
export function homeTask(h: HomeTaskRow, today: number, now: number): TaskItem | null {
  return spineTask({ ...base, ...h, announce_evening: null, member_id: null }, today, now)
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

// A loose to-do: a one-off on its day, its author as « who ». A departure instance is no task.
export function todoTask(td: TodoTaskRow, today: number): TaskItem | null {
  if (!isLooseTodo(td)) return null
  return spineTask(
    {
      ...base,
      id: td.id,
      kind: null,
      title: td.title,
      color: td.color ?? null,
      at: td.day,
      recur_json: null,
      last_done_at: td.done_at,
      member_id: td.member_id,
      subject_kind: td.subject_kind ?? null,
      subject_id: td.subject_id ?? null,
      icon: td.icon ?? null,
      effort: td.effort ?? null,
    },
    today,
    today,
  )
}
