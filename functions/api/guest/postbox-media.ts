import { ok, badRequest, forbidden, serviceUnavailable, tooManyRequests } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { chargeGuestUse } from '../../_lib/guestRate'
import { uploadR2Media } from '../../_lib/r2'
import { insertStagedMedia } from '../../_lib/stagedMedia'

// Stage ONE media blob for a « boîte aux lettres » message (#postbox): a recorded
// voice clip, a drawing PNG (+ its editable scene JSON), or a photo. Bytes go to R2
// under a postbox-distinct prefix (pm_ / ps_) and the key is recorded 'staged'
// (migration 0085) so an abandoned upload gets swept (functions/api/postbox.ts). The
// sender's form puts the returned key on its submission; accept resolves it onto the
// board note. Gated exactly like guest/intake-media (guestScope + route.ts carve-out).
// R2 unset → 503 so the sender's media controls hide and a plain written word still
// sends. The returned `kind` is informational — the sender's scene sets the final
// media_kind ('image' for a photo vs 'drawing' for a doodle), both being image/*.
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx, actor) => {
  if (!(actor.scope === 'guest' && actor.guestKind === 'postbox')) {
    return forbidden('Ce lien ne permet pas d’envoyer un fichier.')
  }
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage indisponible ici.')
  // Per-token flood cap (§509): charge BEFORE the R2 upload so a leaked link can't
  // pump unbounded blobs into storage before it's noticed + revoked.
  if (!(await chargeGuestUse(ctx.env, actor.guestId))) {
    return tooManyRequests('Trop d’envois depuis ce lien. Réessaie plus tard.')
  }

  const type = ctx.request.headers.get('content-type') ?? ''
  const kind = type.startsWith('audio/')
    ? 'audio'
    : type.startsWith('image/')
      ? 'drawing'
      : type.startsWith('application/json')
        ? 'scene'
        : null
  if (!kind) return badRequest('Audio, image ou scène requis.')

  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
    prefix: kind === 'scene' ? 'ps' : 'pm',
    maxBytes: MAX_BYTES,
    accept: () => true,
    sizeError: 'Fichier vide ou trop grand.',
  })
  if ('error' in up) return up.error

  await insertStagedMedia(ctx.env.DB, actor.householdId, actor.guestId ?? '', 'postbox', up.key)

  return ok({ key: up.key, kind })
})
