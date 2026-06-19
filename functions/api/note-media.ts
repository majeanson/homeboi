import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { uploadR2Media } from '../_lib/r2'

// Upload a fridge-note attachment (#38 audio memo / #14 drawn note). Bytes go to
// R2 (the shared PHOTOS bucket + free tier) under an opaque `nm_<id>` key, served
// back by /api/img/<key>. Accepts audio/* (a recorded memo) or image/* (a PNG
// drawing) and reports which. Returns { key, kind }; the caller hands them to
// POST /api/notes. Unbound R2 → 503 so the capture sheet hides Record/Draw and a
// plain text note still works (graceful degrade). Mirrors routine-audio.ts /
// recipe-step-image.ts; the distinct `nm_` prefix keeps note media addressable
// for cleanup when the note is cleared (see notes.ts DELETE).
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  // audio (#38) / image drawing (#14) — plus application/json, the editable drawing
  // SCENE (#1, prefix ns_) so a drawing can be re-opened and added to losslessly.
  const kind = type.startsWith('audio/')
    ? 'audio'
    : type.startsWith('image/')
      ? 'drawing'
      : type.startsWith('application/json')
        ? 'scene'
        : null
  if (!kind) return badRequest('Audio, image ou scène requis.')
  // Type already validated to audio/image/json above → accept any here; the prefix
  // is dynamic (ns_ for the editable scene, nm_ otherwise).
  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
    prefix: kind === 'scene' ? 'ns' : 'nm',
    maxBytes: MAX_BYTES,
    accept: () => true,
    sizeError: 'Fichier vide ou trop grand.',
  })
  if ('error' in up) return up.error
  return ok({ key: up.key, kind })
})
