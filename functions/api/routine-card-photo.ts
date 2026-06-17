import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId } from '../_lib/ids'

// Upload a photo for a kid routine card (feature #17 C). Bytes go to R2 (same
// PHOTOS bucket + free tier as the other photos) under an opaque `rcp_<id>` key,
// served back by /api/img/<key>. Returns the key; the caller stores it in the
// routine's parallel cards_photo_json at the card's index (see
// functions/api/routines.ts). The client resizes before upload (PHOTO_MAX) so
// blobs stay small. Any actor — a parent-mode kiosk builds routines too. Unbound
// R2 → 503 so the upload UI can hide and the kid view simply falls back to the
// card's emoji (graceful degrade).
//
// Mirrors recipe-step-image.ts; the distinct `rcp_` prefix keeps routine card
// photos addressable for cleanup on routine delete (see routines.ts delete path).
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage image indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  const key = `rcp_${newId()}`
  await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
  return ok({ key })
})
