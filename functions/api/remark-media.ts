import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { deleteR2Blob, uploadR2Media } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'

// Upload an attachment for « Les remarques » (0136) — the screenshot that says what
// went wrong, a drawing circling the offending row, or a spoken « regarde, ça fait ça ».
// Bytes go to the shared PHOTOS bucket under an opaque `rm_<id>` key (`rs_` for a
// re-editable drawing SCENE), served back by /api/img/<key>.
//
// A SEPARATE ENDPOINT FROM note-media, for the reason note-media's own header gives:
// the distinct prefix is what keeps a remark's blob addressable for cleanup and keeps
// the DELETE below unable to touch anything else. Reusing `nm_` would work and would
// quietly widen both.
//
// R2 unbound → 503, which is exactly what useMemoAttach reads to hide the 📎 and the
// panel, leaving the text-only path working. A remark must always be reportable.
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage indisponible ici.')
  const type = ctx.request.headers.get('content-type') ?? ''
  const kind = type.startsWith('audio/')
    ? 'audio'
    : type.startsWith('image/')
      ? 'drawing'
      : type.startsWith('application/json')
        ? 'scene'
        : null
  if (!kind) return badRequest('Audio, image ou scène requis.')
  const up = await uploadR2Media(ctx.env.PHOTOS!, ctx.request, { env: ctx.env,
    prefix: kind === 'scene' ? 'rs' : 'rm',
    maxBytes: MAX_BYTES,
    accept: () => true,
    sizeError: 'Fichier vide ou trop grand.',
  })
  if ('error' in up) return up.error
  return ok({ key: up.key, kind })
})

// Free an ABANDONED upload — staged by the composer, then replaced or discarded before
// the remark was saved. Nothing else frees it: the row cleanup only knows about keys a
// saved row references. Blast radius pinned to this endpoint's own two prefixes, so a
// leaked avatar or recipe key handed here cannot be deleted. Idempotent: an unknown or
// foreign key is a no-op 200.
export const onRequestDelete = authed(async (ctx) => {
  if (!ctx.env.PHOTOS) return ok({ ok: true })
  const body = await readJson<{ key?: string }>(ctx.request)
  const key = body?.key?.trim()
  if (!isValidR2Key(key)) return badRequest('key invalide.')
  if (!key!.startsWith('rm_') && !key!.startsWith('rs_')) return badRequest('key hors périmètre.')
  await deleteR2Blob(ctx.env.PHOTOS, key)
  return ok({ ok: true })
})
