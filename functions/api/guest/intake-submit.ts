import { ok, badRequest, forbidden, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { newId, nowSec } from '../../_lib/ids'
import { sanitizeIntake } from '../../_lib/intake'

// The ONE write a guest link is allowed to make — and only the 'intake' kind, the
// relative-facing family-info form. Two gates already converge before this runs:
// guestScope.ts allows an intake token to reach ONLY this path, and route.ts lets
// ONLY an intake guest past the read-only guard. The explicit check below is
// defence-in-depth (and rejects an operator/kiosk that somehow POSTs here).
//
// The submission is QUARANTINED (migration 0075): it lands as a `pending` row the
// operator later reviews + merges into Le cercle. It never touches a live cercle
// table here. The household comes from the SIGNED token, never the client body, so
// a form can only ever write into the household that issued its link.
export const onRequestPost = authed(async (ctx, actor) => {
  if (!(actor.scope === 'guest' && actor.guestKind === 'intake')) {
    return forbidden('Ce lien ne permet pas d’envoyer un formulaire.')
  }

  const submission = sanitizeIntake(await readJson(ctx.request))
  if (!submission) return badRequest('Formulaire incomplet (le prénom est requis).')

  await ctx.env.DB.prepare(
    'INSERT INTO intake_submissions (id, household_id, guest_id, target_key, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      newId(),
      actor.householdId,
      actor.guestId ?? '',
      actor.guestTargetKey ?? null,
      JSON.stringify(submission),
      'pending',
      nowSec(),
    )
    .run()

  return ok({ ok: true })
})
