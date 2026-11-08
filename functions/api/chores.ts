import { badRequest, notFound, ok, readJson, okWire } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, tickedAt } from '../_lib/ids'
import { clearStatements, deleteTaskStatements, FACE } from '../_lib/taskItem'
import { announceEvening, dateSec, DEFAULT_COLOUR, leadSeconds, recurJson } from '../_lib/taskWrite'
import { emojiIcon, hexColor, taskEffort } from '../_lib/validate'
import { subjectBinds, validSubject } from '../_lib/subject'
import { nextTurnIdx, parseRotation, prevTurnIdx, rotationJson, turnOf } from '../_lib/rotation'
import type { Wire } from '../_lib/wire'

const isString = (v: unknown): v is string => typeof v === 'string'

// AN ALIAS since 0150: chores live on the spine (`home_projects`, kind 'chore'), and this
// endpoint keeps the request and response shapes it always had, because a queued offline write
// from yesterday's bundle or a tab left open can still call it. The one form writes through
// /api/tasks; a row's tick, untick, delete and « Vider » still come here (lib/taskSave).
//
// Chores with a round-robin rotation and an optional recurrence ("tous les
// jeudis", see _lib/recur). The ONLY "credit" that exists is last_done_by +
// whose-turn — no points, no streak (NFR-CALM-1). Marking done advances the
// rotation and stamps who/when. The board expands recurring chores onto
// Aujourd'hui / À venir. The start a household chose lives in the spine's `at` and is read back
// as `recur_start`; NULL is still « from created_at » (0032, choreSchedule).
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by, colour AS color, recur_json, at AS recur_start, lead_seconds, announce_evening, subject_kind, subject_id, icon, effort FROM home_projects WHERE household_id = ? AND ${FACE.chore} ORDER BY created_at`,
  )
    .bind(actor.householdId)
    .all<Wire['chores']['chores'][number]>()
  return okWire('chores', { chores: results })
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
  const id = newId()
  const ts = nowSec()
  const [subjectKind, subjectId] = subjectBinds(await validSubject(ctx.env.DB, actor.householdId, body?.subject))
  await ctx.env.DB.prepare(
    "INSERT INTO home_projects (id, household_id, kind, title, rotation_json, current_idx, colour, icon, effort, recur_json, at, lead_seconds, announce_evening, subject_kind, subject_id, created_at, updated_at) VALUES (?, ?, 'chore', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      actor.householdId,
      title,
      rotationJson(body?.rotation),
      hexColor(body?.color, DEFAULT_COLOUR),
      emojiIcon(body?.icon),
      taskEffort(body?.effort),
      recurJson(body?.recur),
      dateSec(body?.start),
      leadSeconds(body?.leadSeconds),
      announceEvening(body?.announceEvening),
      subjectKind,
      subjectId,
      ts,
      ts,
    )
    .run()
  return ok({ id, title })
})

// Mark done / record help. Two shapes, both append a contribution to
// task_participants (the shared-task "who pitched in" log):
//   - complete (default): a parent finishing — stamps last_done + advances the
//     rotation, AND logs the contribution.
//   - complete:false: a helper (typically a toddler in kid view) pitching in —
//     logs the contribution only, does NOT advance the rotation or "finish" it.
// `role` ('parent'|'child') comes from the caller's audience; `memberId`
// defaults to whoever's turn it is. Both kiosk and operator can call this.
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
  }>(ctx.request)
  // « Vider les cochés »: these rows are history, so the bulk gesture stamps them out of the
  // day and deletes nothing (_lib/taskItem).
  if (body?.clearChecked) {
    const ids = Array.isArray(body.ids) ? body.ids.filter(isString) : []
    if (ids.length > 0) await ctx.env.DB.batch(clearStatements(ctx.env.DB, 'chore', actor.householdId, ids, nowSec()))
    return ok({ ok: true })
  }
  if (!body?.id) return badRequest('id requis.')

  // Editing the chore — a distinct shape from marking done: any of title /
  // rotation / color / recur present means "edit this chore in place". One write
  // covers everything the form changed. `start` rides along to anchor a recur. A parent-mode
  // kiosk may edit too (only member admin + device pairing stay operator-only).
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
      // The turn is read modulo its length (_lib/rotation), so a shorter rotation
      // can't index out of range — no need to reset current_idx here.
      sets.push('rotation_json = ?')
      binds.push(rotationJson(body.rotation))
    }
    if (body.color !== undefined) {
      sets.push('colour = ?')
      binds.push(hexColor(body.color, DEFAULT_COLOUR))
    }
    if (body.icon !== undefined) {
      // null (or anything that is not an emoji) puts the subject's icon back (0148).
      sets.push('icon = ?')
      binds.push(emojiIcon(body.icon))
    }
    if (body.effort !== undefined) {
      // null (or anything that is not a dot from 1 to 5) clears it (0149).
      sets.push('effort = ?')
      binds.push(taskEffort(body.effort))
    }
    if (body.recur !== undefined) {
      sets.push('recur_json = ?')
      binds.push(recurJson(body.recur))
      if (body.start !== undefined) {
        sets.push('at = ?') // the start, in the spine's at (0150)
        binds.push(dateSec(body.start))
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
      binds.push(...subjectBinds(await validSubject(ctx.env.DB, actor.householdId, body.subject)))
    }
    if (!sets.length) return ok({ ok: true })
    sets.push('updated_at = ?')
    binds.push(nowSec(), body.id, actor.householdId)
    const res = await ctx.env.DB.prepare(`UPDATE home_projects SET ${sets.join(', ')} WHERE id = ? AND household_id = ? AND ${FACE.chore}`)
      .bind(...binds)
      .run()
    if (!res.meta.changes) return notFound('Corvée introuvable.')
    return ok({ ok: true })
  }

  const chore = await ctx.env.DB.prepare(
    `SELECT rotation_json, current_idx, last_done_at FROM home_projects WHERE id = ? AND household_id = ? AND ${FACE.chore}`,
  )
    .bind(body.id, actor.householdId)
    .first<{ rotation_json: string; current_idx: number; last_done_at: number | null }>()
  if (!chore) return notFound('Corvée introuvable.')

  // Untick a one-off: the row's own check is its undo, so a tick has to be takeable back.
  // It puts back exactly what the tick moved: the stamp, the turn, and the log line.
  if (body.undo) {
    // Nothing to take back: a replayed or doubled untick must not walk the turn backwards.
    if (chore.last_done_at == null) return ok({ ok: true })
    const back = prevTurnIdx(parseRotation(chore.rotation_json), chore.current_idx)
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('DELETE FROM task_participants WHERE task_id = ? AND contributed_at = ?').bind(body.id, chore.last_done_at),
      ctx.env.DB.prepare(
        `UPDATE home_projects SET last_done_at = NULL, last_done_by = NULL, cleared_at = NULL, current_idx = ? WHERE id = ? AND household_id = ? AND ${FACE.chore}`,
      ).bind(back, body.id, actor.householdId),
    ])
    return ok({ ok: true })
  }

  const rotation = parseRotation(chore.rotation_json)
  const turnMember = turnOf(rotation, chore.current_idx)
  const nextIdx = nextTurnIdx(rotation, chore.current_idx)

  const complete = body.complete !== false // default: a parent completing
  const role = body.role === 'child' ? 'child' : 'parent'
  const memberId = body.memberId ?? turnMember
  const ts = tickedAt(body.doneAt, nowSec())

  const writes = [
    ctx.env.DB.prepare(
      'INSERT INTO task_participants (id, task_id, member_id, role, contributed_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(newId(), body.id, memberId, role, ts),
  ]
  if (complete) {
    writes.push(
      ctx.env.DB.prepare(
        `UPDATE home_projects SET last_done_at = ?, last_done_by = ?, current_idx = ? WHERE id = ? AND household_id = ? AND ${FACE.chore}`,
      ).bind(ts, turnMember, nextIdx, body.id, actor.householdId),
    )
  }
  await ctx.env.DB.batch(writes)
  return ok({ ok: true, complete, nextIdx })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // The « qui a aidé » lines go first, in the same transaction (_lib/taskItem). Any face, on
  // purpose: a capture's « Corriger » in a bundle from before 0150 sends a captured task here
  // (CaptureForm's CAPTURE_UNDO_EP maps `tasks` to this endpoint), whatever face it now wears.
  await ctx.env.DB.batch(deleteTaskStatements(ctx.env.DB, actor.householdId, body.id))
  return ok({ ok: true })
})
