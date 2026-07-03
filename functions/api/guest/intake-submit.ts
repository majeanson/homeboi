import { ok, badRequest, forbidden, readJson, tooManyRequests } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { chargeGuestUse } from '../../_lib/guestRate'
import { newId, nowSec } from '../../_lib/ids'
import { sanitizeIntake, decodeIntakeScope, intakeMediaKeys, redactUnownedIntakeMedia } from '../../_lib/intake'
import { ownedStagedKeys } from '../../_lib/stagedMedia'

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
  // Per-token flood cap (§509): bound how many rows/blobs ONE leaked link can create
  // before it's noticed + revoked. Charged BEFORE any work so it can't be flooded.
  if (!(await chargeGuestUse(ctx.env, actor.guestId))) {
    return tooManyRequests('Trop d’envois depuis ce lien. Réessaie plus tard.')
  }

  // Enforce the link's field-scope bitmask SERVER-SIDE (not just in the UI): a
  // name-only link can't smuggle household/pets/address/photos via a crafted POST.
  const scope = decodeIntakeScope(actor.guestFields)
  let submission = sanitizeIntake(await readJson(ctx.request), scope)
  if (!submission) return badRequest('Formulaire incomplet (le prénom est requis).')

  // Ownership: each photoKey must be one THIS guest actually staged (guest/intake-media),
  // not an arbitrary/guessed R2 path smuggled onto a merged member/pet at accept. Drop
  // any the guest didn't stage here (the rest of the form still submits).
  const mediaKeys = intakeMediaKeys(submission)
  if (mediaKeys.length) {
    const owned = await ownedStagedKeys(ctx.env.DB, actor.householdId, 'intake', actor.guestId ?? '', mediaKeys)
    submission = redactUnownedIntakeMedia(submission, owned)
  }

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
