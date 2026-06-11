import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'
import { householdIncludedStores, storeKey } from '../_lib/stores'
import { nowSec } from '../_lib/ids'

// Household-level settings that aren't members/devices/chores: the postal code
// used by the flyer/deal lookups (set once, used every trip) and the allowlist of
// stores the operator chose to consider in those lookups (only included stores
// reach the deal cards / store picker / price-match proof; empty = consider all).
// GET is open to any actor (a kiosk needs to know the location too); PATCH is
// operator-only — a wall tablet shouldn't be able to move the household.

export const onRequestGet = authed(async (ctx, actor) => {
  const postal = await householdPostal(ctx.env, actor.householdId)
  const includedStores = await householdIncludedStores(ctx.env, actor.householdId)
  return ok({ postal, includedStores })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ postal?: string | null; includedStores?: string[] }>(ctx.request)

  // Each field is only touched when its key is present, so the postal form and
  // the store-filter form can PATCH independently without clobbering each other.
  if (body && 'postal' in body) {
    const raw = body.postal
    let value: string | null
    if (raw == null || raw.trim() === '') {
      value = null // empty / null clears it
    } else if (isPostal(raw)) {
      value = normalizePostal(raw)
    } else {
      return badRequest('Code postal invalide (ex. H2X 1Y4).')
    }
    await ctx.env.DB.prepare('UPDATE households SET postal_code = ?, updated_at = ? WHERE id = ?')
      .bind(value, nowSec(), actor.householdId)
      .run()
  }

  if (body && Array.isArray(body.includedStores)) {
    // Normalize to deduped merchant keys; empty list clears the filter (NULL =
    // consider every store).
    const keys = [
      ...new Set(body.includedStores.filter((s): s is string => typeof s === 'string').map(storeKey).filter(Boolean)),
    ]
    await ctx.env.DB.prepare('UPDATE households SET included_stores = ?, updated_at = ? WHERE id = ?')
      .bind(keys.length ? JSON.stringify(keys) : null, nowSec(), actor.householdId)
      .run()
  }

  const postal = await householdPostal(ctx.env, actor.householdId)
  const includedStores = await householdIncludedStores(ctx.env, actor.householdId)
  return ok({ postal, includedStores })
}, 'operator')
