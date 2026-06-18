import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// « Le cercle » — the household people directory (contacts). GET returns the
// whole circle (contacts + their relationship edges) in one shot; the SPA derives
// family groups + birthday chips client-side (src/lib/cercle.ts). POST/PATCH/DELETE
// manage one contact. Relationship EDGES live in their own handler (cercle-links).
//
// A contact photo rides R2 like every other image: POST a raw image blob and you
// get back { key } (mirrors note-media); the key then goes on the contact row as
// photo_key. We free the blob when the photo is replaced or the contact is removed.
//
// CALM: a directory, never a feed. No counts, no streaks. authed() makes a guest
// read-only structurally. Photo upload degrades to a 503 when R2 is unbound (the
// client then just keeps the initials tile).

const MAX_PHOTO_BYTES = 3 * 1024 * 1024 // client resizes well below this

interface ContactRow {
  id: string
  first_name: string
  last_name: string
  nickname: string | null
  photo_key: string | null
  birthday: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  tags: string | null
  member_id: string | null
  custom_fields: string | null
}

interface LinkRow {
  id: string
  person_a_id: string
  person_a_kind: string
  person_b_id: string
  person_b_kind: string
  type: string
  reverse_type: string
  label: string | null
  notes: string | null
}

interface MemberRow {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string
  colour: string
  is_child: number
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const BIRTHDAY_RE = /^\d{1,4}-\d{2}-\d{2}$/
const birthdayOrNull = (v: unknown): string | null => (typeof v === 'string' && BIRTHDAY_RE.test(v.trim()) ? v.trim() : null)
// A JSON value we control, re-serialized defensively (drops anything non-array /
// non-object before storage so a bad client can't poison the column).
function jsonArray(v: unknown): string {
  return JSON.stringify(Array.isArray(v) ? v : [])
}
function jsonObjectOrNull(v: unknown): string | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : null
}
function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export const onRequestGet = authed(async (ctx, actor) => {
  const contacts = await ctx.env.DB.prepare(
    `SELECT id, first_name, last_name, nickname, photo_key, birthday, email, phone, address, notes, tags, member_id, custom_fields
       FROM contacts WHERE household_id = ? ORDER BY last_name, first_name`,
  )
    .bind(actor.householdId)
    .all<ContactRow>()

  const links = await ctx.env.DB.prepare(
    `SELECT id, person_a_id, person_a_kind, person_b_id, person_b_kind, type, reverse_type, label, notes
       FROM contact_links WHERE household_id = ?`,
  )
    .bind(actor.householdId)
    .all<LinkRow>()

  // Household members are first-class PEOPLE in the circle too (phase 2) — a family
  // links its own faces to each other + to contacts. Returned alongside so the SPA
  // merges them into one "people" set (src/lib/cercle.ts buildPeople).
  const members = await ctx.env.DB.prepare(
    'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
  )
    .bind(actor.householdId)
    .all<MemberRow>()

  return ok({
    members: members.results.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      avatarKind: m.avatar_kind,
      avatarRef: m.avatar_ref,
      colour: m.colour,
      isChild: m.is_child === 1,
    })),
    contacts: contacts.results.map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      nickname: c.nickname,
      photoKey: c.photo_key,
      birthday: c.birthday,
      email: c.email,
      phone: c.phone,
      address: parseJson<Record<string, string> | null>(c.address, null),
      notes: c.notes,
      tags: parseJson<string[]>(c.tags, []),
      memberId: c.member_id,
      customFields: parseJson<unknown[]>(c.custom_fields, []),
    })),
    links: links.results.map((l) => ({
      id: l.id,
      personAId: l.person_a_id,
      personAKind: l.person_a_kind,
      personBId: l.person_b_id,
      personBKind: l.person_b_kind,
      type: l.type,
      reverseType: l.reverse_type,
      label: l.label,
      notes: l.notes,
    })),
  })
})

// POST wears two hats by content-type, exactly like the routine-card-photo split:
//   image/*  → upload a contact photo to R2, return { key }
//   JSON     → create a contact
export const onRequestPost = authed(async (ctx, actor) => {
  const type = ctx.request.headers.get('content-type') ?? ''

  if (type.startsWith('image/')) {
    if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
    const buf = await ctx.request.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_PHOTO_BYTES) return badRequest('Image vide ou trop grande.')
    const key = `cn_${newId()}`
    await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
    return ok({ key })
  }

  const body = await readJson<{
    firstName?: string
    lastName?: string
    nickname?: string
    photoKey?: string
    birthday?: string
    email?: string
    phone?: string
    address?: unknown
    notes?: string
    tags?: unknown
    memberId?: string
    customFields?: unknown
  }>(ctx.request)
  const firstName = str(body?.firstName)
  if (!firstName) return badRequest('Prénom requis.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO contacts
       (id, household_id, first_name, last_name, nickname, photo_key, birthday, email, phone, address, notes, tags, member_id, custom_fields, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      firstName,
      str(body?.lastName) ?? '',
      str(body?.nickname),
      str(body?.photoKey),
      birthdayOrNull(body?.birthday),
      str(body?.email),
      str(body?.phone),
      jsonObjectOrNull(body?.address),
      str(body?.notes),
      jsonArray(body?.tags),
      str(body?.memberId),
      jsonArray(body?.customFields),
      ts,
      ts,
    )
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    firstName?: string
    lastName?: string
    nickname?: string | null
    photoKey?: string | null
    birthday?: string | null
    email?: string | null
    phone?: string | null
    address?: unknown
    notes?: string | null
    tags?: unknown
    memberId?: string | null
    customFields?: unknown
  }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare('SELECT photo_key FROM contacts WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ photo_key: string | null }>()
  if (!owns) return notFound('Contact introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }
  if (body.firstName !== undefined) {
    const fn = str(body.firstName)
    if (!fn) return badRequest('Prénom requis.')
    setIf(true, 'first_name', fn)
  }
  setIf(body.lastName !== undefined, 'last_name', str(body.lastName) ?? '')
  setIf('nickname' in body, 'nickname', str(body.nickname))
  setIf('photoKey' in body, 'photo_key', str(body.photoKey))
  setIf('birthday' in body, 'birthday', birthdayOrNull(body.birthday))
  setIf('email' in body, 'email', str(body.email))
  setIf('phone' in body, 'phone', str(body.phone))
  setIf('address' in body, 'address', jsonObjectOrNull(body.address))
  setIf('notes' in body, 'notes', str(body.notes))
  setIf(body.tags !== undefined, 'tags', jsonArray(body.tags))
  setIf('memberId' in body, 'member_id', str(body.memberId))
  setIf(body.customFields !== undefined, 'custom_fields', jsonArray(body.customFields))

  if (sets.length) {
    sets.push('updated_at = ?')
    binds.push(nowSec(), body.id, actor.householdId)
    await ctx.env.DB.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
  }

  // Replacing the photo frees the previous R2 blob (best-effort; a leak is
  // harmless but R2 stays tidy).
  if ('photoKey' in body && ctx.env.PHOTOS) {
    const next = str(body.photoKey)
    if (owns.photo_key && owns.photo_key !== next) await ctx.env.PHOTOS.delete(owns.photo_key).catch(() => {})
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare('SELECT photo_key FROM contacts WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ photo_key: string | null }>()
  if (!owns) return notFound('Contact introuvable.')

  if (owns.photo_key && ctx.env.PHOTOS) await ctx.env.PHOTOS.delete(owns.photo_key).catch(() => {})

  // contact_links FK-reference this contact on either side, so D1 blocks the
  // delete until the edges are gone. Clear them first in one transaction, scoped
  // through the household guard so a wrong household can't wipe another's edges.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'DELETE FROM contact_links WHERE household_id = ? AND (person_a_id = ? OR person_b_id = ?)',
    ).bind(actor.householdId, body.id, body.id),
    ctx.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND household_id = ?').bind(body.id, actor.householdId),
  ])
  return ok({ ok: true })
})
