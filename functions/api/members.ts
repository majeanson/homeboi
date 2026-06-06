import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { hexColor } from '../_lib/validate'

// Household members. Read is open to the kiosk (the board needs faces +
// "pick your face" attribution); create/edit/delete is operator-only. `colour`
// is the tint used for board colour-coding; a member may also carry a photo
// avatar (avatar_kind='photo', avatar_ref=R2 key) — see members/avatar.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child, sort_order FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ members: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ name?: string; color?: string; isChild?: boolean }>(ctx.request)
  const name = body?.name?.trim()
  if (!name) return badRequest('Nom requis.')
  const id = newId()
  const colour = hexColor(body?.color, '#7a8b6f')
  await ctx.env.DB.prepare(
    'INSERT INTO members (id, household_id, display_name, avatar_kind, avatar_ref, colour, is_child, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, name, 'color', colour, colour, body?.isChild ? 1 : 0, nowSec())
    .run()
  return ok({ id, name })
}, 'operator')

// Edit a member: rename, recolour, toggle child, or revert a photo avatar back
// to a colour (clearPhoto). Partial — only the fields sent are touched.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; name?: string; colour?: string; isChild?: boolean; clearPhoto?: boolean }>(
    ctx.request,
  )
  if (!body?.id) return badRequest('id requis.')
  const member = await ctx.env.DB.prepare('SELECT avatar_kind, avatar_ref FROM members WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ avatar_kind: string; avatar_ref: string }>()
  if (!member) return notFound('Membre introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push('display_name = ?')
    binds.push(body.name.trim())
  }
  if (typeof body.colour === 'string') {
    sets.push('colour = ?')
    binds.push(hexColor(body.colour, '#7a8b6f'))
  }
  if (typeof body.isChild === 'boolean') {
    sets.push('is_child = ?')
    binds.push(body.isChild ? 1 : 0)
  }
  if (body.clearPhoto && member.avatar_kind === 'photo') {
    if (ctx.env.PHOTOS && member.avatar_ref) await ctx.env.PHOTOS.delete(member.avatar_ref).catch(() => {})
    // Back to a colour avatar; clear the now-deleted R2 key (legacy: color
    // members keep avatar_ref == colour) so no stale key lingers.
    sets.push("avatar_kind = 'color'", 'avatar_ref = colour')
  }
  if (!sets.length) return ok({ ok: true })
  binds.push(body.id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...binds)
    .run()
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // Five tables FK-reference members(id), so D1 blocks the delete while any
  // still point here. We resolve them in one ordered transaction: the member's
  // routines (and their runs) are theirs alone, so they're deleted; the nullable
  // references (an event's assignee, a chore's last-doer, a meal's cook, a task
  // helper) are detached with SET NULL so the event/chore/meal itself survives,
  // now unassigned. The member is removed last, once nothing references it.
  const id = body.id
  const hh = actor.householdId
  // Best-effort: drop the member's photo blob from R2 so it doesn't orphan.
  const m = await ctx.env.DB.prepare('SELECT avatar_kind, avatar_ref FROM members WHERE id = ? AND household_id = ?')
    .bind(id, hh)
    .first<{ avatar_kind: string; avatar_ref: string }>()
  if (ctx.env.PHOTOS && m?.avatar_kind === 'photo' && m.avatar_ref) {
    await ctx.env.PHOTOS.delete(m.avatar_ref).catch(() => {})
  }
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'DELETE FROM routine_runs WHERE routine_id IN (SELECT id FROM routines WHERE member_id = ? AND household_id = ?)',
    ).bind(id, hh),
    ctx.env.DB.prepare('DELETE FROM routines WHERE member_id = ? AND household_id = ?').bind(id, hh),
    ctx.env.DB.prepare('UPDATE events SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, hh),
    ctx.env.DB.prepare('UPDATE tasks SET last_done_by = NULL WHERE last_done_by = ? AND household_id = ?').bind(id, hh),
    ctx.env.DB.prepare('UPDATE meals SET cook_member_id = NULL WHERE cook_member_id = ? AND household_id = ?').bind(id, hh),
    ctx.env.DB.prepare(
      'UPDATE task_participants SET member_id = NULL WHERE member_id = ? AND task_id IN (SELECT id FROM tasks WHERE household_id = ?)',
    ).bind(id, hh),
    ctx.env.DB.prepare('DELETE FROM members WHERE id = ? AND household_id = ?').bind(id, hh),
  ])
  return ok({ ok: true })
}, 'operator')
