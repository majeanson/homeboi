import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteR2Blob } from '../_lib/r2'

// The drawing COLLECTION / gallery (#14) — kept drawings that DON'T get cleared
// like fridge notes. Each row owns its own R2 blobs (a flat PNG for the glance +
// the editable scene JSON for lossless re-open), uploaded via /api/note-media, so
// clearing a fridge note never frees a kept drawing. Calm: just the works, newest
// first, no counts.
//
//   GET    /api/drawings -> the collection (newest first)
//   POST   /api/drawings -> keep one { media_key, scene_key? }
//   PATCH  /api/drawings -> replace one in place { id, media_key, scene_key? }
//                           (continuing a kept drawing — frees the old blobs)
//   DELETE /api/drawings -> remove one { id } (frees its R2 blobs)

interface DrawingRow {
  id: string
  member_id: string | null
  media_key: string
  scene_key: string | null
  created_at: number
}

const keyish = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.trim())

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, member_id, media_key, scene_key, created_at FROM drawings WHERE household_id = ? ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all<DrawingRow>()
  return ok({ drawings: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ media_key?: string; scene_key?: string }>(ctx.request)
  if (!keyish(body?.media_key)) return badRequest('media_key requis.')
  const sceneKey = keyish(body?.scene_key) ? body!.scene_key!.trim() : null
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO drawings (id, household_id, member_id, media_key, scene_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, profileMemberId(ctx.request), body!.media_key!.trim(), sceneKey, nowSec())
    .run()
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  // Continue a kept drawing: swap to the freshly-uploaded blobs, free the old ones,
  // re-tint to whoever edited + resurface it (newest first). Same shape as the note
  // re-draw path; calm — no counts.
  const body = await readJson<{ id?: string; media_key?: string; scene_key?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id || !keyish(body?.media_key)) return badRequest('id et media_key requis.')
  const mediaKey = body!.media_key!.trim()
  const sceneKey = keyish(body?.scene_key) ? body!.scene_key!.trim() : null
  const row = await ctx.env.DB.prepare('SELECT media_key, scene_key FROM drawings WHERE id = ? AND household_id = ?')
    .bind(id, actor.householdId)
    .first<{ media_key: string | null; scene_key: string | null }>()
  if (!row) return notFound('Dessin introuvable.')
  if (row.media_key && row.media_key !== mediaKey) await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
  if (row.scene_key && row.scene_key !== sceneKey) await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
  await ctx.env.DB.prepare('UPDATE drawings SET media_key = ?, scene_key = ?, member_id = ?, created_at = ? WHERE id = ? AND household_id = ?')
    .bind(mediaKey, sceneKey, profileMemberId(ctx.request), nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Free the R2 blobs first (best-effort) — a removed drawing is gone for good.
  const row = await ctx.env.DB.prepare('SELECT media_key, scene_key FROM drawings WHERE id = ? AND household_id = ?')
    .bind(id, actor.householdId)
    .first<{ media_key: string | null; scene_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.media_key)
  await deleteR2Blob(ctx.env.PHOTOS, row?.scene_key)
  await ctx.env.DB.prepare('DELETE FROM drawings WHERE id = ? AND household_id = ?').bind(id, actor.householdId).run()
  return ok({ ok: true })
})
