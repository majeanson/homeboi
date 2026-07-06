import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { hexColor } from '../_lib/validate'
import { deleteR2Blob } from '../_lib/r2'
import { freeMemberMediaBlobs, memberRefStatements } from '../_lib/members'

// The routine companion is a closed set of creature tokens (lib/companions mirrors
// this) — a soft preference, never free text, so it can't carry a score.
const COMPANIONS = ['fox', 'owl', 'cat', 'bunny', 'bear', 'turtle', 'star', 'cloud']
const companionOrNull = (v: unknown): string | null =>
  typeof v === 'string' && COMPANIONS.includes(v) ? v : null

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
  companion: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  // Return raw snake_case rows (display_name, avatar_kind, avatar_ref, is_child,
  // …). The WHOLE frontend consumes this shape (Board greeting, ProfilePicker,
  // HeartButton, AddSheet, Réglages ▸ Membres, …); a camelCase remap here in
  // d3af3cc silently broke every one of them — e.g. `m.display_name[0]` threw and
  // unmounted the app to a blank page. The cercle's own camelCase `Member` comes
  // from /api/cercle, NOT here — keep these two shapes distinct. The phase-3
  // columns (email/phone/birthday/notes/gender) ride along in snake_case, which is
  // exactly what operator/types.ts and household.tsx expect.
  const { results } = await ctx.env.DB.prepare(
    // `position AS sort_order` keeps the raw snake_case row shape the whole frontend
    // (and operator/types.ts) consumes byte-identical after the DB-3 column rename.
    'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child, position AS sort_order, email, phone, birthday, notes, gender, companion FROM members WHERE household_id = ? ORDER BY position, created_at',
  )
    .bind(actor.householdId)
    .all<MemberRow>()
  return ok({ members: results })
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
    companion?: string | null
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
    await deleteR2Blob(ctx.env.PHOTOS, member.avatar_ref)
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
  if ('companion' in body) {
    sets.push('companion = ?')
    binds.push(companionOrNull(body.companion))
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
  // Many tables FK-reference members(id), so D1 blocks the delete while any still
  // point here. `memberRefStatements` (_lib/members) is the single authoritative
  // detach list — the member's own rows (routines/hearts/schedule/mots) are
  // deleted, nullable references (event assignee, meal cook, note tint, cercle
  // contact link, …) are SET NULL so the host row survives unassigned, and
  // polymorphic cercle edges are cleared. The member is removed last, once nothing
  // references it. (Before this was maintained by hand, a seeded « mot » on a
  // member — e.g. sample "Léa" — blocked her delete outright.)
  const id = body.id
  const hh = actor.householdId
  // Best-effort: drop the member's photo blob + any mot blobs so they don't orphan.
  const m = await ctx.env.DB.prepare('SELECT avatar_kind, avatar_ref FROM members WHERE id = ? AND household_id = ?')
    .bind(id, hh)
    .first<{ avatar_kind: string; avatar_ref: string }>()
  if (m?.avatar_kind === 'photo') await deleteR2Blob(ctx.env.PHOTOS, m.avatar_ref)
  await freeMemberMediaBlobs(ctx.env, hh, id)
  await ctx.env.DB.batch([
    ...memberRefStatements(ctx.env, hh, id),
    ctx.env.DB.prepare('DELETE FROM members WHERE id = ? AND household_id = ?').bind(id, hh),
  ])
  return ok({ ok: true })
}, 'operator')
