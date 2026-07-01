import { ok, badRequest, forbidden, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { newId, nowSec } from '../../_lib/ids'
import { sanitizeIntake, decodeIntakeScope } from '../../_lib/intake'

// A stateless guest link (no DB row, no revoke-before-TTL) can be shared broadly, so
// cap the pending quarantine rows per household to bound row/R2 flooding from a leaked
// link. Well above any honest use (an operator reviews + clears these); once hit, new
// submissions are refused until the queue drains.
const MAX_PENDING = 200

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

  // Enforce the link's field-scope bitmask SERVER-SIDE (not just in the UI): a
  // name-only link can't smuggle household/pets/address/photos via a crafted POST.
  const scope = decodeIntakeScope(actor.guestFields)
  const submission = sanitizeIntake(await readJson(ctx.request), scope)
  if (!submission) return badRequest('Formulaire incomplet (le prénom est requis).')

  const pending = await ctx.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM intake_submissions WHERE household_id = ? AND status = 'pending'",
  )
    .bind(actor.householdId)
    .first<{ n: number }>()
  if ((pending?.n ?? 0) >= MAX_PENDING) {
    return forbidden('Trop de formulaires en attente. Réessaie plus tard.')
  }

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
