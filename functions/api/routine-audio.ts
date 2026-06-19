import { ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { uploadR2Media } from '../_lib/r2'

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
  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
    prefix: 'rn',
    maxBytes: MAX_BYTES,
    accept: (t) => t.startsWith('audio/'),
    typeError: 'Audio requis.',
    sizeError: 'Audio vide ou trop long.',
  })
  if ('error' in up) return up.error
  return ok({ key: up.key })
})
