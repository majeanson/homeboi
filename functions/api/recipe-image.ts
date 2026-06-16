import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId } from '../_lib/ids'

// Upload a recipe picture. Bytes go to R2 (same bucket + free tier as family
// photos) under an opaque `rc_<id>` key, served back by /api/img/<key>. Returns
// the key; the caller stores it in recipes.image. The client resizes before
// upload (PHOTO_MAX) so blobs stay small. Any actor — a parent-mode kiosk builds
// recipes too (recipes CRUD was never operator-gated); only member admin + device
// pairing stay operator-only. Unbound R2 → 503 so the UI can fall back to no picture.
//
// Unlike /api/photos this does NOT index a row or prune — a recipe owns its
// image via recipes.image, and recipes.DELETE/PATCH free the R2 blob.
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage image indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return badRequest('Image requise.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Image vide ou trop grande.')

  const key = `rc_${newId()}`
  await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
  return ok({ key })
})
