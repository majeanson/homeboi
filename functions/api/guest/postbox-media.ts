import { ok, badRequest, forbidden, serviceUnavailable } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { uploadR2Media } from '../../_lib/r2'
import { newId, nowSec } from '../../_lib/ids'

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

  await ctx.env.DB.prepare(
    'INSERT INTO postbox_media (id, household_id, guest_id, media_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, actor.guestId ?? '', up.key, 'staged', nowSec())
    .run()

  return ok({ key: up.key, kind })
})
