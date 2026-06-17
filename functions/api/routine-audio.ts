import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId } from '../_lib/ids'

// Upload a parent-voice narration clip for a kid routine card (feature #17 A).
// Bytes go to R2 (same PHOTOS bucket + free tier as photos) under an opaque
// `rn_<id>` key, served back by /api/img/<key>. Returns the key; the caller
// stores it in the routine's parallel cards_narration_json at the card's index
// (see functions/api/routines.ts). Any actor — a parent-mode kiosk records too
// (routines CRUD was never operator-gated). Unbound R2 → 503 so the recording UI
// can hide and the kid view falls back to on-device TTS (graceful degrade).
//
// Mirrors recipe-image.ts. Audio not image: accepts audio/*. A short spoken line
// is tiny (a few seconds of compressed audio ≪ 1 MB), so the cap is modest.
const MAX_BYTES = 2 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage audio indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('audio/')) return badRequest('Audio requis.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Audio vide ou trop long.')

  const key = `rn_${newId()}`
  await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
  return ok({ key })
})
