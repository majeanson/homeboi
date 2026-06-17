import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId } from '../_lib/ids'

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
  const kind = type.startsWith('audio/') ? 'audio' : type.startsWith('image/') ? 'drawing' : null
  if (!kind) return badRequest('Audio ou image requis.')
  const buf = await ctx.request.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return badRequest('Fichier vide ou trop grand.')

  const key = `nm_${newId()}`
  await ctx.env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } })
  return ok({ key, kind })
})
