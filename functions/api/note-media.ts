import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'

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

// Free an ABANDONED note-media upload — a blob that was uploaded here but never
// written into a row (the composer replaced/removed the attachment, or discarded
// the whole note before saving). Nothing else frees it: the row-delete cleanups in
// notes.ts / family-notes.ts only free keys a saved row references, so an in-editor
// replace/discard would otherwise orphan the blob in R2 forever (a slow storage leak).
//
// The opaque key IS the capability (see api/img/[key] — reads are unauthenticated by
// design), so freeing by key is symmetric with reading by key; we still require an
// authed household member (guests are blocked from any non-GET by `authed()`) and
// restrict the blast radius to note-media's own `nm_`/`ns_` prefixes so this can only
// ever delete a note attachment, never an avatar / recipe photo whose key leaked here.
// Best-effort + idempotent: a bad/foreign/unknown key is a no-op 200, never an error.
export const onRequestDelete = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return ok({ ok: true }) // R2 unbound → nothing to free
  const body = await readJson<{ key?: string }>(ctx.request)
  const key = body?.key?.trim()
  if (!isValidR2Key(key)) return badRequest('key invalide.')
  if (!key!.startsWith('nm_') && !key!.startsWith('ns_')) return badRequest('key hors périmètre.')
  await deleteR2Blob(ctx.env.PHOTOS, key)
  return ok({ ok: true })
})
