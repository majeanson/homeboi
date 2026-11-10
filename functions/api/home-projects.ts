import { badRequest, notFound, ok, readJson, okWire } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, localDayStart, tickedAt } from '../_lib/ids'
import { FACE } from '../_lib/taskItem'
import { rotationJson } from '../_lib/rotation'
import { budgetCents, DEFAULT_COLOUR, homeKind, leadSeconds, notesOf, recurFromOf, recurJson, subjectCols } from '../_lib/taskWrite'
import { taskDayOf, withTaskDay } from '../_lib/taskDay'
import { clearTasks, snoozeTask, tickTask, untickTask } from '../_lib/taskGestures'
import { deleteHealing } from '../_lib/staleDelete'
import { profileMemberId } from '../_lib/profile'
import { emojiIcon, hexColor, taskEffort } from '../_lib/validate'
import { upkeepStatus } from '../_lib/upkeep'
import { validSubject } from '../_lib/subject'

// "Projets & Entretien" — the longer-horizon home work (see migration 0074). Since 0150 the
// table is the SPINE every task lives in. This endpoint SERVES its home rows (`kind` 'plan' |
// 'upkeep'), with the shape it always had: the Réglages lists, the carnets, the season card and
// search read it. Its WRITES are an alias (a queued offline write or an old tab can still call
// it): since 0153 a tick, an untick, « Reporter », « Vider » and a delete are the one gesture
// every task has (_lib/taskGestures), and an edit names its row by id. The one form writes
// through /api/tasks.
//
// `kind` ('plan'|'upkeep') discriminates the two faces; the frontend filters by kind. A row may
// carry BOTH a budget AND a recurrence (a water-heater replacement is both maintenance and a
// budgeted purchase). The board expands recurring/dated rows onto Aujourd'hui / À venir, and
// the edit-vs-complete PATCH split lets a kiosk check an upkeep occurrence off the board.
// NFR-CALM-1: budget is a descriptive target only (no progress bar), no counts.

// A carnet_id is only honoured when it names a carnet THIS household owns (mirrors
// care-log / home-pins). A foreign/garbage id stores NULL rather than a dangling link.
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
async function validCarnetId(db: D1Database, hh: string, v: unknown): Promise<string | null> {
  const id = str(v)
  if (!id) return null
  const owns = await db.prepare('SELECT id FROM carnets WHERE id = ? AND household_id = ?').bind(id, hh).first<{ id: string }>()
  return owns ? id : null
}

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

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    kind?: string
    title?: string
    notes?: string | null
    budgetCents?: number | null
    color?: string
    at?: unknown
    recur?: unknown
    recurFrom?: unknown
    leadSeconds?: number | null
    carnetId?: string | null
    subject?: unknown
    rotation?: unknown
    icon?: unknown
    effort?: unknown
  }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  const at = taskDayOf(body?.at)
  // `subject` wins when both are sent; `carnetId` remains the older spelling of one kind of it.
  const cols =
    body?.subject !== undefined
      ? subjectCols('home', await validSubject(ctx.env.DB, actor.householdId, body.subject, id))
      : { carnet_id: await validCarnetId(ctx.env.DB, actor.householdId, body?.carnetId), subject_kind: null, subject_id: null }
  await ctx.env.DB.prepare(
    'INSERT INTO home_projects (id, household_id, kind, title, notes, budget_cents, colour, icon, effort, at, recur_json, recur_from, lead_seconds, carnet_id, subject_kind, subject_id, rotation_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      homeKind(body?.kind),
      title,
      notesOf(body?.notes),
      budgetCents(body?.budgetCents),
      hexColor(body?.color, DEFAULT_COLOUR),
      emojiIcon(body?.icon),
      taskEffort(body?.effort),
      at,
      recurJson(body?.recur),
      recurFromOf(body?.recurFrom),
      at ? leadSeconds(body?.leadSeconds) : null, // a lead needs an occurrence date to anchor against
      cols.carnet_id,
      cols.subject_kind,
      cols.subject_id,
      rotationJson(body?.rotation),
      ts,
      ts,
    )
    .run()
  return ok({ id, title })
})

// Three shapes (mirrors chores.ts, + « Reporter »):
//   - edit:     any content field present → update the row in place (the same
//               form creates and edits). A parent-mode kiosk may edit too.
//   - snooze:   `{ id, snooze: 'week' | 'cycle' | null }` → postpone: the row
//               goes quiet (no due, no owed) until the target day, then simply
//               returns. 'week' = 7 local days from today; 'cycle' = the next
//               scheduled occurrence (recurring rows; falls back to a week);
//               null wakes it now. Kiosk-checkable like a complete.
//   - complete: `id` alone → stamp last_done_at (mark this cycle done / archive
//               a one-off) — and CLEAR any snooze, so a stale « reporté » can
//               never mute the next cycle. Kiosk + operator can both call this,
//               so an upkeep occurrence is checkable straight off the board.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    title?: string
    notes?: string | null
    budgetCents?: number | null
    color?: string
    at?: unknown
    recur?: unknown
    recurFrom?: unknown
    leadSeconds?: number | null
    carnetId?: string | null
    subject?: unknown
    rotation?: unknown
    icon?: unknown
    effort?: unknown
    snooze?: unknown
    doneAt?: unknown
    undo?: boolean
    clearChecked?: boolean
    ids?: unknown
    items?: unknown
    asOf?: unknown
  }>(ctx.request)
  const db = ctx.env.DB
  const hh = actor.householdId
  // « Vider les cochés »: history, never a delete; a named clear that names nothing is a 404.
  if (body?.clearChecked) {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
    if (ids.length > 0 && (await clearTasks(db, hh, ids, body.items, body.asOf)).length === 0) return notFound('Aucune tâche à effacer.')
    return ok({ ok: true })
  }
  if (!body?.id) return badRequest('id requis.')

  if (body.snooze !== undefined) {
    const r = await snoozeTask(db, hh, body.id, body.snooze)
    if (r === 'bad') return badRequest('snooze invalide.')
    if (r === 'missing') return notFound('Introuvable.')
    return ok({ ok: true, snoozedUntil: r.until })
  }

  const editsContent =
    body.title !== undefined ||
    body.notes !== undefined ||
    body.budgetCents !== undefined ||
    body.color !== undefined ||
    body.at !== undefined ||
    body.recur !== undefined ||
    body.recurFrom !== undefined ||
    body.leadSeconds !== undefined ||
    body.carnetId !== undefined ||
    body.subject !== undefined ||
    body.rotation !== undefined ||
    body.icon !== undefined ||
    body.effort !== undefined
  if (editsContent) {
    const sets: string[] = []
    const binds: unknown[] = []
    if (typeof body.title === 'string' && body.title.trim()) {
      sets.push('title = ?')
      binds.push(body.title.trim())
    }
    if (body.notes !== undefined) {
      sets.push('notes = ?')
      binds.push(notesOf(body.notes))
    }
    if (body.budgetCents !== undefined) {
      sets.push('budget_cents = ?')
      binds.push(budgetCents(body.budgetCents))
    }
    if (body.color !== undefined) {
      sets.push('colour = ?')
      binds.push(hexColor(body.color, DEFAULT_COLOUR))
    }
    if (body.icon !== undefined) {
      sets.push('icon = ?')
      binds.push(emojiIcon(body.icon))
    }
    if (body.effort !== undefined) {
      // null (or anything that is not a dot from 1 to 5) clears it (0149).
      sets.push('effort = ?')
      binds.push(taskEffort(body.effort))
    }
    if (body.at !== undefined) {
      sets.push('at = ?')
      binds.push(taskDayOf(body.at))
    }
    if (body.recur !== undefined) {
      sets.push('recur_json = ?')
      binds.push(recurJson(body.recur))
    }
    if (body.recurFrom !== undefined) {
      sets.push('recur_from = ?')
      binds.push(recurFromOf(body.recurFrom))
    }
    if (body.leadSeconds !== undefined) {
      sets.push('lead_seconds = ?')
      binds.push(leadSeconds(body.leadSeconds))
    }
    if (body.subject !== undefined) {
      const cols = subjectCols('home', await validSubject(ctx.env.DB, actor.householdId, body.subject, body.id))
      sets.push('carnet_id = ?', 'subject_kind = ?', 'subject_id = ?')
      binds.push(cols.carnet_id, cols.subject_kind, cols.subject_id)
    } else if (body.carnetId !== undefined) {
      // The older door still means « one subject »: naming a carnet clears any other kind.
      sets.push('carnet_id = ?', 'subject_kind = NULL', 'subject_id = NULL')
      binds.push(await validCarnetId(ctx.env.DB, actor.householdId, body.carnetId))
    }
    if (body.rotation !== undefined) {
      sets.push('rotation_json = ?')
      binds.push(rotationJson(body.rotation))
    }
    if (!sets.length) return ok({ ok: true })
    sets.push('updated_at = ?')
    binds.push(nowSec())
    binds.push(body.id, actor.householdId)
    const res = await db.prepare(`UPDATE home_projects SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`).bind(...binds).run()
    if (!res.meta.changes) return notFound('Introuvable.')
    return ok({ ok: true })
  }

  // Untick: the row's own check is its undo, and it puts back what the tick moved.
  if (body.undo) return (await untickTask(db, hh, body.id)) ? ok({ ok: true }) : notFound('Introuvable.')

  // Complete: the one tick (_lib/taskGestures), at the moment it really happened. A series'
  // next occurrence then shows; a one-off stays ticked for the day. Done beats postponed.
  const r = await tickTask(db, hh, body.id, { who: profileMemberId(ctx.request), at: tickedAt(body.doneAt, nowSec()) })
  if (!r) return notFound('Introuvable.')
  return ok({ ok: true, done: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; text?: unknown; asOf?: unknown }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // Any task, with its « qui a aidé » lines: a capture's compensating undo sends every captured
  // task here (CaptureForm maps `home_projects` to this endpoint). A stale id heals or 404s.
  const r = await deleteHealing(ctx.env.DB, { table: 'tasks', textColumn: 'title', householdId: actor.householdId, id: body.id, text: body.text, asOf: body.asOf })
  if (r.outcome === 'missing') return notFound('Introuvable.')
  return ok({ ok: true })
})
