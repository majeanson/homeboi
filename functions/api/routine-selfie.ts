import { ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { uploadR2Media } from '../_lib/r2'

// Upload a daily "moment of the day" selfie for a routine (#C). Bytes go to R2 (the
// same PHOTOS bucket + free tier) under an opaque `rsf_<id>` key, served back by
// /api/img/<key>. Returns the key; the caller writes it into today's routine_runs
// row via PATCH /api/routines { feelingPhoto } — the media_key convention. The client
// resizes before upload (PHOTO_MAX) so blobs stay small. Any actor — the toddler taps
// it at the end of their routine. Unbound R2 → 503 so the selfie control hides and the
// mood-only path still works (graceful degrade).
//
// A per-day selfie is a MOMENT, not an album: it lives on the run row (kept ~7 days),
// its blob freed on overwrite/reset/routine-delete/the lazy ~7-day prune in routines.ts
// — so nothing leaks. The distinct `rsf_` prefix keeps these blobs addressable for that
// cleanup. Mirrors routine-card-photo.ts.
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage image indisponible ici.')
  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, { prefix: 'rsf', maxBytes: MAX_BYTES })
  if ('error' in up) return up.error
  return ok({ key: up.key })
})
