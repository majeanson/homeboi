import { badRequest, notFound, ok, readJson, okWire } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec, tickedAt } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { FACE } from '../_lib/taskItem'
import { announceEvening, DEFAULT_COLOUR, insertTask, leadSeconds, recurJson, taskStart } from '../_lib/taskWrite'
import { taskDay, taskDayOf } from '../_lib/taskDay'
import { clearTasks, tickTask, untickTask } from '../_lib/taskGestures'
import { deleteHealing } from '../_lib/staleDelete'
import { emojiIcon, hexColor, taskEffort } from '../_lib/validate'
import { subjectBinds, validSubject } from '../_lib/subject'
import { rotationJson } from '../_lib/rotation'
import type { Wire } from '../_lib/wire'

const isString = (v: unknown): v is string => typeof v === 'string'

// AN ALIAS, kept because a queued offline write from an older bundle or a tab left open can
// still call it, in the request and response shapes it always had. Since 0153 there are no
// chores: every task (kind NULL) is served here in the old chore shape, and every gesture is
// the one every task has (_lib/taskGestures): a tick records who did it and moves the turn of
// « chacun son tour », an untick puts back what it moved, « Vider » stamps `cleared_at`. The
// one form and every row of today's client write through /api/tasks.
//
// No points, no streak (NFR-CALM-1): who did it and whose turn, nothing else. The day a task
// counts from is read back as `recur_start`, a household-local midnight (_lib/taskDay).
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by, colour AS color, recur_json, at AS recur_start, lead_seconds, announce_evening, subject_kind, subject_id, icon, effort FROM home_projects WHERE household_id = ? AND ${FACE.task} ORDER BY created_at`,
  )
    .bind(actor.householdId)
    .all<Wire['chores']['chores'][number]>()
  return okWire('chores', { chores: results.map((c) => ({ ...c, recur_start: taskDay(c.recur_start) })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    title?: string
    rotation?: string[]
    color?: string
    recur?: unknown
    start?: unknown
    leadSeconds?: number | null
    announceEvening?: boolean
    subject?: unknown
    icon?: unknown
    effort?: unknown
  }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  // The old chore form's body, as the one form spells it: the same rule picks what it is.
  const { id } = await insertTask(
    ctx.env.DB,
    actor.householdId,
    {
      title,
      rotation: body?.rotation,
      color: body?.color,
      recur: body?.recur,
      at: taskDayOf(body?.start),
      leadSeconds: body?.leadSeconds,
      announceEvening: body?.announceEvening,
      subject: body?.subject,
      icon: body?.icon,
      effort: taskEffort(body?.effort),
    },
    profileMemberId(ctx.request),
    { title },
  )
  return ok({ id, title })
})

// Three shapes: « Vider » (`clearChecked`), an edit (any content field), else a tick:
//   - complete (default): stamps the tick, logs who did it, moves the turn;
//   - complete:false: a helper (a toddler in kid view) pitching in: logged, nothing finished;
//   - undo: the tick taken back.
// `memberId` names who did it; else the face the device acts as; else whose turn it was.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    role?: string
    memberId?: string
    complete?: boolean
    title?: string
    rotation?: unknown
    color?: string
    recur?: unknown
    start?: unknown
    leadSeconds?: number | null
    announceEvening?: boolean
    subject?: unknown
    icon?: unknown
    effort?: unknown
    doneAt?: unknown
    undo?: boolean
    clearChecked?: boolean
    ids?: unknown
    items?: unknown
    asOf?: unknown
  }>(ctx.request)
  const db = ctx.env.DB
  const hh = actor.householdId
  if (body?.clearChecked) {
    const ids = Array.isArray(body.ids) ? body.ids.filter(isString) : []
    if (ids.length > 0 && (await clearTasks(db, hh, ids, body.items, body.asOf)).length === 0) return notFound('Aucune tâche à effacer.')
    return ok({ ok: true })
  }
  if (!body?.id) return badRequest('id requis.')

  // Editing in place, a distinct shape from a tick: only the fields sent change.
  const editsContent =
    body.title !== undefined ||
    body.rotation !== undefined ||
    body.color !== undefined ||
    body.recur !== undefined ||
    body.leadSeconds !== undefined ||
    body.announceEvening !== undefined ||
    body.subject !== undefined ||
    body.icon !== undefined ||
    body.effort !== undefined
  if (editsContent) {
    const sets: string[] = []
    const binds: unknown[] = []
    if (typeof body.title === 'string' && body.title.trim()) {
      sets.push('title = ?')
      binds.push(body.title.trim())
    }
    if (body.rotation !== undefined) {
      // The turn is read modulo its length (_lib/rotation): no reset needed.
      sets.push('rotation_json = ?')
      binds.push(rotationJson(body.rotation))
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
      sets.push('effort = ?')
      binds.push(taskEffort(body.effort))
    }
    if (body.recur !== undefined) {
      sets.push('recur_json = ?')
      binds.push(recurJson(body.recur))
      if (body.start !== undefined && taskDayOf(body.start) != null) {
        sets.push('at = ?')
        binds.push(taskDayOf(body.start))
      } else if (recurJson(body.recur) != null) {
        // A series carries its start (0152): one that had none counts from today.
        sets.push('at = COALESCE(at, ?)')
        binds.push(taskStart(true, null))
      }
    }
    if (body.leadSeconds !== undefined) {
      sets.push('lead_seconds = ?')
      binds.push(leadSeconds(body.leadSeconds))
    }
    if (body.announceEvening !== undefined) {
      sets.push('announce_evening = ?')
      binds.push(announceEvening(body.announceEvening))
    }
    if (body.subject !== undefined) {
      sets.push('subject_kind = ?', 'subject_id = ?')
      binds.push(...subjectBinds(await validSubject(db, hh, body.subject)))
    }
    if (!sets.length) return ok({ ok: true })
    sets.push('updated_at = ?')
    binds.push(nowSec(), body.id, hh)
    const res = await db.prepare(`UPDATE home_projects SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`).bind(...binds).run()
    if (!res.meta.changes) return notFound('Tâche introuvable.')
    return ok({ ok: true })
  }

  if (body.undo) return (await untickTask(db, hh, body.id)) ? ok({ ok: true }) : notFound('Tâche introuvable.')
  const who = body.memberId || profileMemberId(ctx.request)
  const r = await tickTask(db, hh, body.id, { who, at: tickedAt(body.doneAt, nowSec()), complete: body.complete !== false, role: body.role })
  if (!r) return notFound('Tâche introuvable.')
  return ok({ ok: true, ...r })
})

// Any task, with its « qui a aidé » lines; a stale id heals or answers 404 (_lib/staleDelete).
// A capture's « Corriger » in a bundle from before 0150 sends a captured task here.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; text?: unknown; asOf?: unknown }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const r = await deleteHealing(ctx.env.DB, { table: 'tasks', textColumn: 'title', householdId: actor.householdId, id: body.id, text: body.text, asOf: body.asOf })
  if (r.outcome === 'missing') return notFound('Tâche introuvable.')
  return ok({ ok: true })
})
