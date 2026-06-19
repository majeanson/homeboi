import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'

// Per-person photo gallery for « Le cercle » — extra pictures attached to one
// contact with a short caption (an ID card, a screenshot of a coworker, a snapshot
// together). The blob itself uploads through POST /api/cercle (image/*) exactly
// like the avatar and gives back { key }; here we only track the attachment row.
//   GET ?contactId=…                      → list a contact's photos (newest first)
//   POST   {contactId, photoKey, caption?} → attach an already-uploaded blob
//   PATCH  {id, caption}                   → edit a caption
//   DELETE {id}                            → detach the photo + free its R2 blob
// authed() makes a guest read-only structurally; every query is household-scoped.

interface PhotoRow {
  id: string
  photo_key: string
  caption: string | null
  created_at: number
}

const caption = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export const onRequestGet = authed(async (ctx, actor) => {
  const contactId = new URL(ctx.request.url).searchParams.get('contactId')
  if (!contactId) return badRequest('contactId requis.')
  const rows = await ctx.env.DB.prepare(
    `SELECT id, photo_key, caption, created_at FROM contact_photos
       WHERE contact_id = ? AND household_id = ? ORDER BY created_at DESC`,
  )
    .bind(contactId, actor.householdId)
    .all<PhotoRow>()
  return ok({
    photos: rows.results.map((r) => ({ id: r.id, photoKey: r.photo_key, caption: r.caption, createdAt: r.created_at })),
  })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ contactId?: string; photoKey?: string; caption?: string }>(ctx.request)
  if (!body?.contactId || !body?.photoKey) return badRequest('contactId et photoKey requis.')
  // The contact must belong to this household (the gallery can't dangle off a
  // stranger's contact id).
  const owns = await ctx.env.DB.prepare('SELECT id FROM contacts WHERE id = ? AND household_id = ?')
    .bind(body.contactId, actor.householdId)
    .first()
  if (!owns) return notFound('Contact introuvable.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO contact_photos (id, household_id, contact_id, photo_key, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, body.contactId, body.photoKey, caption(body.caption), nowSec())
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; caption?: string | null }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const { meta } = await ctx.env.DB.prepare('UPDATE contact_photos SET caption = ? WHERE id = ? AND household_id = ?')
    .bind(caption(body.caption), body.id, actor.householdId)
    .run()
  if (!meta.changes) return notFound('Photo introuvable.')
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare('SELECT photo_key FROM contact_photos WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ photo_key: string }>()
  if (!row) return notFound('Photo introuvable.')
  // Free the R2 blob first (best-effort — a leak is harmless but R2 stays tidy).
  await deleteR2Blob(ctx.env.PHOTOS, row.photo_key)
  await ctx.env.DB.prepare('DELETE FROM contact_photos WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
