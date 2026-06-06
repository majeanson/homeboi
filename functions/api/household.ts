import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'
import { nowSec } from '../_lib/ids'

// Household-level settings that aren't members/devices/chores. Today that's just
// the postal code used by the flyer/deal lookups (set once, used every trip).
// GET is open to any actor (a kiosk needs to know the location too); PATCH is
// operator-only — a wall tablet shouldn't be able to move the household.

export const onRequestGet = authed(async (ctx, actor) => {
  const postal = await householdPostal(ctx.env, actor.householdId)
  return ok({ postal })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ postal?: string | null }>(ctx.request)
  // Empty string / null clears it; otherwise it must be a valid postal code.
  const raw = body?.postal
  let value: string | null
  if (raw == null || raw.trim() === '') {
    value = null
  } else if (isPostal(raw)) {
    value = normalizePostal(raw)
  } else {
    return badRequest('Code postal invalide (ex. H2X 1Y4).')
  }

  await ctx.env.DB.prepare('UPDATE households SET postal_code = ?, updated_at = ? WHERE id = ?')
    .bind(value, nowSec(), actor.householdId)
    .run()
  return ok({ postal: value })
}, 'operator')
