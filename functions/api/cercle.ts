import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'

// « Le cercle » — the household people directory (contacts). GET returns the
// whole circle (contacts + their relationship edges + named groups) in one shot;
// the SPA derives family groups + birthday chips client-side (src/lib/cercle.ts).
// POST/PATCH/DELETE manage one contact. Relationship EDGES live in their own
// handler (cercle-links). Named groups live in cercle-groups.
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
  gender: string | null
  gift_ideas: string | null
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
  email: string | null
  phone: string | null
  birthday: string | null
  notes: string | null
  gender: string | null
}

interface GroupRow {
  id: string
  name: string
  kind: string
  colour: string | null
}

interface GroupMemberRow {
  group_id: string
  person_id: string
  person_kind: string
}

interface PetRow {
  id: string
  name: string
  species: string | null
  breed: string | null
  photo_key: string | null
  colour: string | null
  birthday: string | null
  microchip: string | null
  feeding: string | null
  sitter_notes: string | null
  vet_business_id: string | null
  weights: string
  notes: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const genderOrNull = (v: unknown): string | null => (v === 'm' || v === 'f' ? v : null)
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
    `SELECT id, first_name, last_name, nickname, photo_key, birthday, email, phone, address, notes, tags, member_id, custom_fields, gender, gift_ideas
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
    'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child, email, phone, birthday, notes, gender FROM members WHERE household_id = ? ORDER BY position, created_at',
  )
    .bind(actor.householdId)
    .all<MemberRow>()

  // Named people groups (phase 3). Two queries: groups then their members, merged
  // in JS. Avoids NULL-row duplication from a LEFT JOIN when groups are empty.
  const groups = await ctx.env.DB.prepare(
    'SELECT id, name, kind, colour FROM contact_groups WHERE household_id = ? ORDER BY position, created_at',
  )
    .bind(actor.householdId)
    .all<GroupRow>()

  const groupMembers = groups.results.length
    ? await ctx.env.DB.prepare(
        `SELECT group_id, person_id, person_kind FROM contact_group_members
           WHERE group_id IN (SELECT id FROM contact_groups WHERE household_id = ?)`,
      )
        .bind(actor.householdId)
        .all<GroupMemberRow>()
    : { results: [] as GroupMemberRow[] }

  // Build a map group_id → [{personId, personKind}]
  const gmByGroup = new Map<string, { personId: string; personKind: string }[]>()
  for (const gm of groupMembers.results) {
    if (!gmByGroup.has(gm.group_id)) gmByGroup.set(gm.group_id, [])
    gmByGroup.get(gm.group_id)!.push({ personId: gm.person_id, personKind: gm.person_kind })
  }

  // Pets are people in the circle too (PersonKind 'pet') — returned so the SPA folds
  // them into the same people set. Only the fields the directory + people graph need;
  // the rich care fields (feeding/microchip/weights/sitter/vet) ride the same rows.
  const pets = await ctx.env.DB.prepare(
    `SELECT id, name, species, breed, photo_key, colour, birthday, microchip, feeding, sitter_notes, vet_business_id, weights, notes
       FROM pets WHERE household_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
  )
    .bind(actor.householdId)
    .all<PetRow>()

  return ok({
    members: members.results.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      avatarKind: m.avatar_kind,
      avatarRef: m.avatar_ref,
      colour: m.colour,
      isChild: m.is_child === 1,
      email: m.email ?? null,
      phone: m.phone ?? null,
      birthday: m.birthday ?? null,
      notes: m.notes ?? null,
      gender: m.gender ?? null,
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
      gender: c.gender ?? null,
      giftIdeas: c.gift_ideas ?? null,
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
    groups: groups.results.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      colour: g.colour,
      memberKeys: gmByGroup.get(g.id) ?? [],
    })),
    pets: pets.results.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      photoKey: p.photo_key,
      colour: p.colour,
      birthday: p.birthday,
      microchip: p.microchip,
      feeding: p.feeding,
      sitterNotes: p.sitter_notes,
      vetBusinessId: p.vet_business_id,
      weights: parseJson<unknown[]>(p.weights, []),
      notes: p.notes,
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
    // Already image-gated by the dispatch above → accept any here.
    const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
      prefix: 'cn',
      maxBytes: MAX_PHOTO_BYTES,
      accept: () => true,
    })
    if ('error' in up) return up.error
    return ok({ key: up.key })
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
    gender?: string
    giftIdeas?: string
  }>(ctx.request)
  const firstName = str(body?.firstName)
  if (!firstName) return badRequest('Prénom requis.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO contacts
       (id, household_id, first_name, last_name, nickname, photo_key, birthday, email, phone, address, notes, tags, member_id, custom_fields, gender, gift_ideas, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      genderOrNull(body?.gender),
      str(body?.giftIdeas),
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
    gender?: string | null
    giftIdeas?: string | null
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
  setIf('gender' in body, 'gender', genderOrNull(body.gender))
  setIf('giftIdeas' in body, 'gift_ideas', str(body.giftIdeas))

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
    if (owns.photo_key !== next) await deleteR2Blob(ctx.env.PHOTOS, owns.photo_key)
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

  await deleteR2Blob(ctx.env.PHOTOS, owns.photo_key)

  // Free the gallery blobs (contact_photos rows cascade with the contact, but the
  // R2 objects don't — fetch their keys first, then best-effort delete each blob).
  if (ctx.env.PHOTOS) {
    const gallery = await ctx.env.DB.prepare(
      'SELECT photo_key FROM contact_photos WHERE contact_id = ? AND household_id = ?',
    )
      .bind(body.id, actor.householdId)
      .all<{ photo_key: string }>()
    for (const row of gallery.results) {
      await deleteR2Blob(ctx.env.PHOTOS, row.photo_key)
    }
  }

  // contact_links FK-reference this contact on either side, so D1 blocks the
  // delete until the edges are gone. Clear them first in one transaction, scoped
  // through the household guard so a wrong household can't wipe another's edges.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'DELETE FROM contact_links WHERE household_id = ? AND (person_a_id = ? OR person_b_id = ?)',
    ).bind(actor.householdId, body.id, body.id),
    // Named group memberships (polymorphic, no FK).
    ctx.env.DB.prepare(
      "DELETE FROM contact_group_members WHERE person_kind = 'contact' AND person_id = ?",
    ).bind(body.id),
    ctx.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND household_id = ?').bind(body.id, actor.householdId),
  ])
  return ok({ ok: true })
})
