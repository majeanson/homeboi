import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'

// « Le cercle » → Business: the household's services / vendors directory (vet,
// hospital, plumber, business cards…). DELIBERATELY separate from contacts — a
// business is NOT a person, so it never touches the cercle people graph. Strictly
// for quick access + notes + linking a rendez-vous (events.business_id).
//
//   GET    /api/businesses -> all live businesses, A→Z
//   POST   /api/businesses -> image blob → upload a card photo, return { key }
//                          -> JSON → create a business
//   PATCH  /api/businesses -> edit one { id, …fields } (frees a replaced photo)
//   DELETE /api/businesses -> soft-clear one { id } (sets deleted_at; frees photo)
//
// CALM: a directory, never a feed — no counts/streaks. authed() makes a guest
// read-only structurally. Photo upload degrades to 503 when R2 is unbound (the
// client keeps the category-icon tile).

const MAX_PHOTO_BYTES = 3 * 1024 * 1024 // client resizes well below this

interface BusinessRow {
  id: string
  name: string
  category: string | null
  phone: string | null
  email: string | null
  address: string | null
  website: string | null
  notes: string | null
  photo_key: string | null
  colour: string | null
  created_at: number
  updated_at: number
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const NAME_CAP = 200
const TEXT_CAP = 2000

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    `SELECT id, name, category, phone, email, address, website, notes, photo_key, colour, created_at, updated_at
       FROM businesses WHERE household_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
  )
    .bind(actor.householdId)
    .all<BusinessRow>()

  // Backlink: which « carnets » this business has serviced, from care_log.business_id
  // → distinct carnet. Pure read over existing rows (no schema), so a vendor's peek can
  // show "A servi : 🔥 Chauffe-eau". A since-archived carnet drops out of the join.
  const served = await ctx.env.DB.prepare(
    `SELECT DISTINCT cl.business_id AS bid, c.id AS cid, c.name AS cname, c.kind AS ckind
       FROM care_log cl
       JOIN carnets c ON c.id = cl.carnet_id AND c.household_id = cl.household_id
      WHERE cl.household_id = ? AND cl.business_id IS NOT NULL AND c.archived_at IS NULL
      ORDER BY c.position, c.created_at`,
  )
    .bind(actor.householdId)
    .all<{ bid: string; cid: string; cname: string; ckind: string }>()
  const byBiz = new Map<string, { id: string; name: string; kind: string }[]>()
  for (const r of served.results) {
    const list = byBiz.get(r.bid) ?? []
    list.push({ id: r.cid, name: r.cname, kind: r.ckind })
    byBiz.set(r.bid, list)
  }

  return ok({
    businesses: rows.results.map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      phone: b.phone,
      email: b.email,
      address: b.address,
      website: b.website,
      notes: b.notes,
      photoKey: b.photo_key,
      colour: b.colour,
      servicedCarnets: byBiz.get(b.id) ?? [],
    })),
  })
})

// POST wears two hats by content-type (mirrors /api/cercle):
//   image/*  → upload a business-card photo to R2, return { key }
//   JSON     → create a business
export const onRequestPost = authed(async (ctx, actor) => {
  const type = ctx.request.headers.get('content-type') ?? ''

  if (type.startsWith('image/')) {
    if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
    const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
      prefix: 'bz',
      maxBytes: MAX_PHOTO_BYTES,
      accept: () => true,
    })
    if ('error' in up) return up.error
    return ok({ key: up.key })
  }

  const body = await readJson<{
    name?: string
    category?: string
    phone?: string
    email?: string
    address?: string
    website?: string
    notes?: string
    photoKey?: string
    colour?: string
  }>(ctx.request)
  const name = str(body?.name)?.slice(0, NAME_CAP)
  if (!name) return badRequest('Nom requis.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO businesses
       (id, household_id, name, category, phone, email, address, website, notes, photo_key, colour, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      actor.householdId,
      name,
      str(body?.category),
      str(body?.phone),
      str(body?.email),
      str(body?.address),
      str(body?.website),
      str(body?.notes)?.slice(0, TEXT_CAP) ?? null,
      str(body?.photoKey),
      str(body?.colour),
      ts,
      ts,
    )
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    name?: string
    category?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    website?: string | null
    notes?: string | null
    photoKey?: string | null
    colour?: string | null
  }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const owns = await ctx.env.DB.prepare(
    'SELECT photo_key FROM businesses WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(body.id, actor.householdId)
    .first<{ photo_key: string | null }>()
  if (!owns) return notFound('Business introuvable.')

  const sets: string[] = []
  const binds: unknown[] = []
  const setIf = (present: boolean, col: string, value: unknown) => {
    if (present) {
      sets.push(`${col} = ?`)
      binds.push(value)
    }
  }
  if (body.name !== undefined) {
    const n = str(body.name)?.slice(0, NAME_CAP)
    if (!n) return badRequest('Nom requis.')
    setIf(true, 'name', n)
  }
  setIf('category' in body, 'category', str(body.category))
  setIf('phone' in body, 'phone', str(body.phone))
  setIf('email' in body, 'email', str(body.email))
  setIf('address' in body, 'address', str(body.address))
  setIf('website' in body, 'website', str(body.website))
  setIf('notes' in body, 'notes', str(body.notes)?.slice(0, TEXT_CAP) ?? null)
  setIf('photoKey' in body, 'photo_key', str(body.photoKey))
  setIf('colour' in body, 'colour', str(body.colour))

  if (sets.length) {
    sets.push('updated_at = ?')
    binds.push(nowSec(), body.id, actor.householdId)
    await ctx.env.DB.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
      .bind(...binds)
      .run()
  }

  // Replacing the photo frees the previous R2 blob (best-effort).
  if ('photoKey' in body && ctx.env.PHOTOS) {
    const next = str(body.photoKey)
    if (owns.photo_key !== next) await deleteR2Blob(ctx.env.PHOTOS, owns.photo_key)
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const owns = await ctx.env.DB.prepare(
    'SELECT photo_key FROM businesses WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(body.id, actor.householdId)
    .first<{ photo_key: string | null }>()
  // Free the card photo (best-effort). A linked event keeps its business_id; the
  // join just resolves to no name, exactly like a since-deleted contact.
  await deleteR2Blob(ctx.env.PHOTOS, owns?.photo_key)
  await ctx.env.DB.prepare('UPDATE businesses SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
