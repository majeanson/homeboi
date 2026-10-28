import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'

// Upload a per-step recipe photo (feature #17 B). Bytes go to R2 (same PHOTOS
// bucket + free tier as the dish picture) under an opaque `rsi_<id>` key, served
// back by /api/img/<key>. Returns the key; the caller stores it in the recipe's
// parallel steps_images_json at the step's index (see functions/api/recipes.ts).
// The client resizes before upload (PHOTO_MAX) so blobs stay small. Any actor —
// a parent-mode kiosk builds recipes too. Unbound R2 → 503 so the upload UI can
// hide and Cook mode simply shows no per-step photo (graceful degrade).
//
// Mirrors recipe-image.ts; distinct `rsi_` prefix keeps step photos addressable
// for cleanup on recipe delete (see recipes.ts delete path).
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage image indisponible ici.')
  const up = await uploadR2Media(ctx.env.PHOTOS!, ctx.request, { env: ctx.env, prefix: 'rsi', maxBytes: MAX_BYTES })
  if ('error' in up) return up.error
  return ok({ key: up.key })
})

// Free step photos a form held but never saved (C3, 2026-10-27): an import brings the
// site's step photos in as R2 keys BEFORE the recipe exists, and a cancelled form would
// leave them orphaned. Only an `rsi_` key that NO recipe references is deleted — so a
// key that a save already adopted, or another household's, can never be freed here.
export const onRequestDelete = authed(async (ctx) => {
  const body = await readJson<{ keys?: unknown }>(ctx.request)
  const keys = (Array.isArray(body?.keys) ? body.keys : []).filter((k): k is string => typeof k === 'string' && /^rsi_[A-Za-z0-9_-]{6,80}$/.test(k)).slice(0, 40)
  if (!keys.length) return badRequest('Clés requises.')
  if (!ctx.env.PHOTOS) return ok({ freed: 0 })
  let freed = 0
  for (const key of keys) {
    const used = await ctx.env.DB.prepare('SELECT 1 FROM recipes WHERE steps_images_json LIKE ? LIMIT 1').bind(`%"${key}"%`).first()
    if (used) continue
    await deleteR2Blob(ctx.env.PHOTOS, key)
    freed++
  }
  return ok({ freed })
}, 'operator')
