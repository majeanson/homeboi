import { badRequest, forbidden, notFound, ok, parseJsonArray, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { hexColor } from '../_lib/validate'
import { normalizeRecur } from '../_lib/recur'

const isString = (v: unknown): v is string => typeof v === 'string'
const recurJson = (recur: unknown): string | null => {
  const r = normalizeRecur(recur)
  return r ? JSON.stringify(r) : null
}
// The recurrence anchor the operator chose (unix-seconds, UTC-midnight of the
// picked day). null = no explicit start → the board falls back to created_at.
const recurStart = (start: unknown): number | null => {
  const n = Number(start)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

// Chores with a round-robin rotation and an optional recurrence ("tous les
// jeudis", see _lib/recur). The ONLY "credit" that exists is last_done_by +
// whose-turn — no points, no streak (NFR-CALM-1). Marking done advances the
// rotation and stamps who/when. The board expands recurring chores onto
// Aujourd'hui / À venir; created_at is the recurrence anchor.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by, color, recur_json, recur_start FROM tasks WHERE household_id = ? ORDER BY created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ chores: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ title?: string; rotation?: string[]; color?: string; recur?: unknown; start?: unknown }>(
    ctx.request,
  )
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const color = hexColor(body?.color, '#88a36f')
  await ctx.env.DB.prepare(
    'INSERT INTO tasks (id, household_id, title, rotation_json, current_idx, color, recur_json, recur_start, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      title,
      JSON.stringify(body?.rotation ?? []),
      color,
      recurJson(body?.recur),
      recurStart(body?.start),
      nowSec(),
    )
    .run()
  return ok({ id, title })
}, 'operator')

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
    recur?: unknown
    start?: unknown
  }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  // Editing the schedule (operator only) — a distinct shape from marking done:
  // a `recur` field present means "set this chore's recurrence" (null clears it).
  // A `start` field (present) sets the recurrence anchor in the same write, so a
  // standing chore can be turned into "every 2 weeks from the 20th" without
  // recreating it.
  if (body.recur !== undefined) {
    if (actor.scope !== 'operator') return forbidden('Opérateur requis.')
    const sets = ['recur_json = ?']
    const binds: unknown[] = [recurJson(body.recur)]
    if (body.start !== undefined) {
      sets.push('recur_start = ?')
      binds.push(recurStart(body.start))
    }
    binds.push(body.id, actor.householdId)
    const res = await ctx.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
    if (!res.meta.changes) return notFound('Corvée introuvable.')
    return ok({ ok: true })
  }

  const chore = await ctx.env.DB.prepare(
    'SELECT rotation_json, current_idx FROM tasks WHERE id = ? AND household_id = ?',
  )
    .bind(body.id, actor.householdId)
    .first<{ rotation_json: string; current_idx: number }>()
  if (!chore) return notFound('Corvée introuvable.')

  const rotation = parseJsonArray<string>(chore.rotation_json, isString)
  const turnMember = rotation.length ? rotation[chore.current_idx % rotation.length] : null
  const nextIdx = rotation.length ? (chore.current_idx + 1) % rotation.length : 0

  const complete = body.complete !== false // default: a parent completing
  const role = body.role === 'child' ? 'child' : 'parent'
  const memberId = body.memberId ?? turnMember
  const ts = nowSec()

  const writes = [
    ctx.env.DB.prepare(
      'INSERT INTO task_participants (id, task_id, member_id, role, contributed_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(newId(), body.id, memberId, role, ts),
  ]
  if (complete) {
    writes.push(
      ctx.env.DB.prepare(
        'UPDATE tasks SET last_done_at = ?, last_done_by = ?, current_idx = ? WHERE id = ? AND household_id = ?',
      ).bind(ts, turnMember, nextIdx, body.id, actor.householdId),
    )
  }
  await ctx.env.DB.batch(writes)
  return ok({ ok: true, complete, nextIdx })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // task_participants.task_id FK-references this task, so D1 blocks the delete
  // until the contribution log is gone. Clear it first in one transaction. The
  // participants are scoped through the task's own household guard, so a wrong
  // household can't wipe another's log.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'DELETE FROM task_participants WHERE task_id IN (SELECT id FROM tasks WHERE id = ? AND household_id = ?)',
    ).bind(body.id, actor.householdId),
    ctx.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND household_id = ?').bind(body.id, actor.householdId),
  ])
  return ok({ ok: true })
}, 'operator')
