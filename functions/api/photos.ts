import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'

// Family photos for the wall-board frame. Bytes live in R2 (free tier, no
// egress); these rows index them by key. GET is open to any actor (the kiosk
// shows the frame); upload + delete accept any actor (a parent-mode kiosk too —
// only member admin + device pairing stay operator-only). To guarantee we never
// outgrow the free tier, the set is CAPPED — uploading past MAX_PHOTOS prunes the
// oldest (row + R2 blob). Resizing happens client-side before upload.
const MAX_PHOTOS = 30
const MAX_BYTES = 3 * 1024 * 1024 // safety net; the client already resizes to ~<300 KB

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, media_key AS r2_key FROM photos WHERE household_id = ? ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all<{ id: string; r2_key: string }>()
  return ok({ photos: results.map((p) => ({ id: p.id, key: p.r2_key })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage photo indisponible ici.')
  // Flat, URL-safe key (single path segment so /api/img/[key] serves it). The
  // random id is the unguessable capability; household scope lives in the row.
  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, { prefix: 'ph', maxBytes: MAX_BYTES })
  if ('error' in up) return up.error
  const key = up.key
  await ctx.env.DB.prepare('INSERT INTO photos (id, household_id, media_key, created_at) VALUES (?, ?, ?, ?)')
    .bind(newId(), actor.householdId, key, nowSec())
    .run()

  // Keep only the most recent MAX_PHOTOS — drop older rows AND their R2 blobs so
  // storage stays bounded (LIMIT -1 OFFSET n = "everything past the first n").
  const stale = await ctx.env.DB.prepare(
    'SELECT id, media_key AS r2_key FROM photos WHERE household_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?',
  )
    .bind(actor.householdId, MAX_PHOTOS)
    .all<{ id: string; r2_key: string }>()
  for (const row of stale.results) {
    await deleteR2Blob(ctx.env.PHOTOS, row.r2_key)
    await ctx.env.DB.prepare('DELETE FROM photos WHERE id = ? AND household_id = ?').bind(row.id, actor.householdId).run()
  }
  return ok({ key })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare('SELECT media_key AS r2_key FROM photos WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .first<{ r2_key: string }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.r2_key)
  await ctx.env.DB.prepare('DELETE FROM photos WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
