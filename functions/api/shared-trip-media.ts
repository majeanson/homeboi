import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { uploadR2Media } from '../_lib/r2'

// « Voyage partagé » media upload — the shared-trip twin of trip-doc-media. One
// endpoint for every shared-trip attachment: a DOCUMENT (reservation / passport /
// boarding pass, image OR application/pdf), a shared PHOTO, an editable DRAWING (PNG) +
// its scene (json), or an AUDIO memo. Bytes go to R2 under a SHARE-OWNED `st_<id>` key
// (scene under `ss_`) with a self-describing extension. Returns { key, kind }; the
// caller writes it into shared_trip_notes via POST /api/shared-trip-notes.
//
// Plain operator-auth, NO membership check — same as trip-doc-media: the blob is an
// orphan until the guarded shared-trip-notes POST attaches it (that POST is the
// membership-checked write). Unbound R2 → 503 so the media controls hide and the text
// path still works (degrade).
const MAX_BYTES = 10 * 1024 * 1024 // documents (PDF scans) run larger than a note photo

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  // Map the content-type to a media_kind the shared_trip_notes row understands. A PDF
  // and a photo are both stored as 'image' (a document); the key extension distinguishes
  // them at render time. Audio = a voice memo; json = the editable drawing scene.
  const kind = type.startsWith('audio/')
    ? 'audio'
    : type.startsWith('application/pdf') || type.startsWith('image/')
      ? 'image'
      : type.startsWith('application/json')
        ? 'scene'
        : null
  if (!kind) return badRequest('Document, image, audio ou scène requis.')
  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
    prefix: kind === 'scene' ? 'ss' : 'st',
    maxBytes: MAX_BYTES,
    accept: () => true, // type already narrowed above
    extFromType: true, // self-describing key so the doc viewer can pick iframe vs <img>
    sizeError: 'Fichier vide ou trop grand.',
  })
  if ('error' in up) return up.error
  return ok({ key: up.key, kind })
}, 'operator')
