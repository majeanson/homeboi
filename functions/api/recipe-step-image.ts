import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId } from '../_lib/ids'

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
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  const key = `rsi_${newId()}`
  await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
  return ok({ key })
})
