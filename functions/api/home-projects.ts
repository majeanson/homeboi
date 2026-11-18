import { okWire } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec, localDayStart } from '../_lib/ids'
import { FACE } from '../_lib/taskItem'
import { withTaskDay } from '../_lib/taskDay'
import { upkeepStatus } from '../_lib/upkeep'

// "Projets & Entretien" — the longer-horizon home work (see migration 0074). Since 0150 the
// table is the SPINE every task lives in. This endpoint READS its home rows (`kind` 'plan' |
// 'upkeep') in the shape it always had: the Réglages lists, the carnets, the season card and
// search read it. It has no writes since review #37: every gesture and every edit is the one
// task door's (/api/tasks, _lib/taskGestures); its alias writes had no client caller left.
//
// `kind` ('plan'|'upkeep') discriminates the two faces; the frontend filters by kind. A row may
// carry BOTH a budget AND a recurrence (a water-heater replacement is both maintenance and a
// budgeted purchase). NFR-CALM-1: budget is a descriptive target only (no progress bar), no counts.

interface ProjectRow {
  id: string
  kind: string
  title: string
  notes: string | null
  budget_cents: number | null
  color: string | null
  at: number | null
  recur_json: string | null
  recur_from: string | null
  lead_seconds: number | null
  last_done_at: number | null
  snoozed_until: number | null
  carnet_id: string | null
  subject_kind: string | null // soft ref (0146), no FK; a carnet stays in carnet_id
  subject_id: string | null
  rotation_json: string // « chacun son tour » (0147), the one path in _lib/rotation
  current_idx: number
  last_done_by: string | null
  icon: string | null // 0148: an emoji over the subject's, null = « comme le sujet »
  effort: number | null // 0149: 1 to 5, null = not said
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, kind, title, notes, budget_cents, colour AS color, at, recur_json, recur_from, lead_seconds, last_done_at, snoozed_until, carnet_id, subject_kind, subject_id, rotation_json, current_idx, last_done_by, icon, effort FROM home_projects WHERE household_id = ? AND ${FACE.home} ORDER BY created_at`,
  )
    .bind(actor.householdId)
    .all<ProjectRow>()
  // Derived scheduling facts, from the ONE expander (_lib/upkeep): nextAt lets the
  // client group « cette saison » without re-implementing recurrence; overdueSince /
  // dueToday are the calm carry-forward the board and season card render.
  const today = localDayStart(new Date(nowSec() * 1000))
  const projects = results.map(withTaskDay).map((p) => ({ ...p, ...upkeepStatus(p, today) }))
  return okWire('home-projects', { projects })
})
