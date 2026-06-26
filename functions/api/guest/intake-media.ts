import { ok, forbidden, serviceUnavailable } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { uploadR2Media } from '../../_lib/r2'
import { newId, nowSec } from '../../_lib/ids'

// The SECOND (and last) write an 'intake' link may make: stage ONE photo. A guest
// can't touch the cercle, so a photo can't attach to a not-yet-existing contact —
// the bytes go to R2 and the key is recorded as 'staged' (migration 0076). The
// relative's form puts the returned key on a person/pet in its submission; the
// operator's review resolves it onto the real contact (or frees it on dismiss).
//
// Gated like guest/intake-submit: guestScope.ts allows an intake token to reach only
// this path, and route.ts lets only an intake guest past the read-only guard. R2
// unset → 503 so the form hides the photo control and text-only intake still works.
const MAX_BYTES = 3 * 1024 * 1024

export const onRequestPost = authed(async (ctx, actor) => {
  if (!(actor.scope === 'guest' && actor.guestKind === 'intake')) {
    return forbidden('Ce lien ne permet pas d’envoyer une photo.')
  }
  if (!ctx.env.PHOTOS) return serviceUnavailable('Stockage indisponible ici.')

  const up = await uploadR2Media(ctx.env.PHOTOS, ctx.request, {
    prefix: 'ik', // intake key — distinct so the cleanup sweep can recognise its own
    maxBytes: MAX_BYTES,
    accept: (t) => t.startsWith('image/'),
    typeError: 'Image requise.',
    sizeError: 'Image vide ou trop grande.',
  })
  if ('error' in up) return up.error

  await ctx.env.DB.prepare(
    'INSERT INTO intake_media (id, household_id, guest_id, media_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, actor.guestId ?? '', up.key, 'staged', nowSec())
    .run()

  return ok({ key: up.key })
})
