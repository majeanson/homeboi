import type { Env } from '../_lib/env'
import { ok, notFound } from '../_lib/json'
import { readLiveShare } from '../_lib/shareStore'
import type { IntakeSubmission } from '../_lib/intake'

// The PUBLIC read for a /partage/<id> page — deliberately NOT wrapped in authed(): the
// unguessable id IS the capability, exactly like /api/img/<key>. A signed-out visitor
// hits this to see the shared thing (and a « Rejoindre Babillard » CTA); a signed-in
// visitor sees the same render plus an import action. GET only (no write path exists).
//
// Content kinds (recipe/event/routine) return the FULL snapshot — it's the sender's own
// public content. Family returns a TEASER ONLY (count of people/pets, no payload): a
// family snapshot is third-party PII (names, birthdays, phones, addresses, photos), so
// its full read stays signed-in-only via /api/share?s= + the /cercle/import merge, exactly
// the bar the app has today. The public page shows the teaser + « Ouvrir dans Babillard ».
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = new URL(ctx.request.url).searchParams.get('s')
  if (!id) return notFound('Ce partage n’existe plus.')
  const share = await readLiveShare(ctx.env, id)
  if (!share) return notFound('Ce partage n’existe plus.')

  if (share.kind === 'family') {
    let peopleCount = 0
    let petCount = 0
    try {
      const p = JSON.parse(share.payload) as IntakeSubmission
      peopleCount = 1 + (Array.isArray(p.household) ? p.household.length : 0)
      petCount = Array.isArray(p.pets) ? p.pets.length : 0
    } catch {
      /* a corrupt row still shows a bare teaser rather than 500ing */
    }
    return ok({ kind: 'family', label: share.label, sourceName: share.sourceName, peopleCount, petCount })
  }

  let payload: unknown
  try {
    payload = JSON.parse(share.payload)
  } catch {
    return notFound('Ce partage n’existe plus.')
  }
  return ok({ kind: share.kind, label: share.label, sourceName: share.sourceName, payload, expiresAt: share.expiresAt })
}
