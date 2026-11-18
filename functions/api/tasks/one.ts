import { badRequest, okWire } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { FACE } from '../../_lib/taskItem'
import { taskDay } from '../../_lib/taskDay'
import type { Wire } from '../../_lib/wire'

// ONE task, with its whole schedule — what the one form opens on (lib/taskSave, the `task`
// face). The Tâches frame (/api/tasks) carries a task as the list draws it, not the start a
// series counts from, its lead or its turn; this answers that for the row being edited.
//
// It was the GET of /api/chores, an alias of the task merge deleted in review #37: its writes
// had been the one door's for a week, but this read was still the form's, under a name for a
// table that no longer existed. `recur_start` is the day the series counts from, a
// household-local midnight (_lib/taskDay). A row that is not a task (a home row, or another
// household's) is `task: null`.
export const onRequestGet = authed(async (ctx, actor) => {
  const id = new URL(ctx.request.url).searchParams.get('id')?.trim()
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    `SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by, colour AS color, recur_json, at AS recur_start, lead_seconds, announce_evening, subject_kind, subject_id, icon, effort FROM home_projects WHERE id = ? AND household_id = ? AND ${FACE.task}`,
  )
    .bind(id, actor.householdId)
    .first<NonNullable<Wire['tasks/one']['task']>>()
  return okWire('tasks/one', { task: row ? { ...row, recur_start: taskDay(row.recur_start) } : null })
})
