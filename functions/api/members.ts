import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { hexColor } from '../_lib/validate'

// Household members. Read is open to the kiosk (the board needs faces +
// "pick your face" attribution); create/edit/delete is operator-only. `colour`
// is the tint used for board colour-coding; a member may also carry a photo
// avatar (avatar_kind='photo', avatar_ref=R2 key) — see members/avatar.
// Phase 3: members now also carry email, phone, birthday, notes to mirror the
// contact fields in le cercle — the same person, just living in the household.

const BIRTHDAY_RE = /^\d{1,4}-\d{2}-\d{2}$/
const birthdayOrNull = (v: unknown): string | null =>
  typeof v === 'string' && BIRTHDAY_RE.test(v.trim()) ? v.trim() : null
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const genderOrNull = (v: unknown): string | null => (v === 'm' || v === 'f' ? v : null)

interface MemberRow {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string
  colour: string
  is_child: number
  sort_order: number
  email: string | null
  phone: string | null
  birthday: string | null
  notes: string | null
  gender: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child, sort_order, email, phone, birthday, notes, gender FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
  )
    .bind(actor.householdId)
    .all<MemberRow>()
  return ok({
    members: results.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      avatarKind: r.avatar_kind,
      avatarRef: r.avatar_ref,
      colour: r.colour,
      isChild: r.is_child === 1,
      email: r.email ?? null,
      phone: r.phone ?? null,
      birthday: r.birthday ?? null,
      notes: r.notes ?? null,
      gender: r.gender ?? null,
    })),
  })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    name?: string
    color?: string
    isChild?: boolean
    email?: string
    phone?: string
    birthday?: string
    notes?: string
    gender?: string
  }>(ctx.request)
  const name = body?.name?.trim()
  if (!name) return badRequest('Nom requis.')
  const id = newId()
  const colour = hexColor(body?.color, '#7a8b6f')
  await ctx.env.DB.prepare(
    'INSERT INTO members (id, household_id, display_name, avatar_kind, avatar_ref, colour, is_child, email, phone, birthday, notes, gender, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      name,
      'color',
      colour,
      colour,
      body?.isChild ? 1 : 0,
      str(body?.email),
      str(body?.phone),
      birthdayOrNull(body?.birthday),
      str(body?.notes),
      genderOrNull(body?.gender),
      nowSec(),
    )
    .run()
  return ok({ id, name })
}, 'operator')

// Edit a member: rename, recolour, toggle child, or revert a photo avatar back
// to a colour (clearPhoto). Partial — only the fields sent are touched.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    name?: string
    colour?: string
    isChild?: boolean
    clearPhoto?: boolean
    email?: string | null
    phone?: string | null
    birthday?: string | null
    notes?: string | null
    gender?: string | null
  }>(ctx.request)
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
  if ('email' in body) {
    sets.push('email = ?')
    binds.push(str(body.email))
  }
  if ('phone' in body) {
    sets.push('phone = ?')
    binds.push(str(body.phone))
  }
  if ('birthday' in body) {
    sets.push('birthday = ?')
    binds.push(birthdayOrNull(body.birthday))
  }
  if ('notes' in body) {
    sets.push('notes = ?')
    binds.push(str(body.notes))
  }
  if ('gender' in body) {
    sets.push('gender = ?')
    binds.push(genderOrNull(body.gender))
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
    // « Le cercle » edges that point at this member (as a person, kind='member')
    // — drop them so a removed face leaves no dangling relationship (mirrors the
    // contact cascade in cercle.ts). Stored without an FK (polymorphic), so it's
    // our job to clean up.
    ctx.env.DB.prepare(
      "DELETE FROM contact_links WHERE household_id = ? AND ((person_a_id = ? AND person_a_kind = 'member') OR (person_b_id = ? AND person_b_kind = 'member'))",
    ).bind(hh, id, id),
    // Named group memberships for this member (polymorphic, no FK).
    ctx.env.DB.prepare(
      "DELETE FROM contact_group_members WHERE person_kind = 'member' AND person_id = ?",
    ).bind(id),
    ctx.env.DB.prepare('DELETE FROM members WHERE id = ? AND household_id = ?').bind(id, hh),
  ])
  return ok({ ok: true })
}, 'operator')
