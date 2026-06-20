import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { isPostal, normalizePostal, householdPostal } from '../_lib/postal'
import { householdIncludedStores, storeKey } from '../_lib/stores'
import { householdMealSlotPrefs, cleanColors, cleanHidden } from '../_lib/mealSlots'
import { householdMeasureColors, cleanMeasureColors } from '../_lib/measureColors'
import { householdReserveLocations, cleanReserveLocations } from '../_lib/reserveLocations'
import { householdAiEnabled } from '../_lib/aiPref'
import { nowSec } from '../_lib/ids'

// Household-level settings that aren't members/devices/chores: the postal code
// used by the flyer/deal lookups (set once, used every trip), the allowlist of
// stores the operator chose to consider in those lookups (only included stores
// reach the deal cards / store picker / price-match proof; empty = consider all),
// and the per-slot meal colours + hide-list (so a meal reads the same colour on
// every surface, and "I only care about souper" can drop the other slots).
// GET is open to any actor (a kiosk needs the location AND the meal colours too);
// PATCH accepts any actor too — a parent-mode kiosk may set these household prefs
// (postal, store filter, meal colours, reserve spots); only member admin + device
// pairing stay operator-only.

// The household's display name ("Famille Jeanson", "La maisonnée") — set at signup,
// renamable in Réglages. NOT NULL in the schema, so a blank rename is rejected (not
// stored); capped at 60 like signup.
async function householdName(env: { DB: D1Database }, householdId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT name FROM households WHERE id = ?').bind(householdId).first<{ name: string }>()
  return row?.name ?? ''
}

export const onRequestGet = authed(async (ctx, actor) => {
  const name = await householdName(ctx.env, actor.householdId)
  const postal = await householdPostal(ctx.env, actor.householdId)
  const includedStores = await householdIncludedStores(ctx.env, actor.householdId)
  const meals = await householdMealSlotPrefs(ctx.env, actor.householdId)
  const measureColors = await householdMeasureColors(ctx.env, actor.householdId)
  const reserveLocations = await householdReserveLocations(ctx.env, actor.householdId)
  const aiEnabled = await householdAiEnabled(ctx.env, actor.householdId)
  return ok({
    name,
    postal,
    includedStores,
    mealColors: meals.colors,
    mealHidden: meals.hidden,
    measureColors,
    reserveLocations,
    aiEnabled,
  })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    name?: string
    postal?: string | null
    includedStores?: string[]
    mealColors?: Record<string, string>
    mealHidden?: string[]
    measureColors?: Record<string, string>
    reserveLocations?: unknown
    aiEnabled?: boolean
  }>(ctx.request)

  // Household name: trimmed + capped at 60 (like signup). Blank is ignored — the
  // column is NOT NULL and a household always keeps a name.
  if (body && 'name' in body) {
    const name = body.name?.trim().slice(0, 60)
    if (!name) return badRequest('Nom de la maisonnée requis.')
    await ctx.env.DB.prepare('UPDATE households SET name = ?, updated_at = ? WHERE id = ?')
      .bind(name, nowSec(), actor.householdId)
      .run()
  }

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

  // Per-slot meal colours: a {slot: hex} map. Only valid pairs survive; an empty
  // result (every slot reset to its default) clears the column back to NULL.
  if (body && 'mealColors' in body) {
    const colors = cleanColors(body.mealColors)
    await ctx.env.DB.prepare('UPDATE households SET meal_slot_colors = ?, updated_at = ? WHERE id = ?')
      .bind(Object.keys(colors).length ? JSON.stringify(colors) : null, nowSec(), actor.householdId)
      .run()
  }

  // Hidden slots: a list of slot names to drop from the glance/plan. Empty list
  // clears the column (NULL = show every slot).
  if (body && 'mealHidden' in body) {
    const hidden = cleanHidden(body.mealHidden)
    await ctx.env.DB.prepare('UPDATE households SET meal_slot_hidden = ?, updated_at = ? WHERE id = ?')
      .bind(hidden.length ? JSON.stringify(hidden) : null, nowSec(), actor.householdId)
      .run()
  }

  // Per-tool measure colours: a {swatchId: hex} map. Only valid pairs survive; an
  // empty result (every tool reset to default) clears the column back to NULL.
  if (body && 'measureColors' in body) {
    const colors = cleanMeasureColors(body.measureColors)
    await ctx.env.DB.prepare('UPDATE households SET measure_colors = ?, updated_at = ? WHERE id = ?')
      .bind(Object.keys(colors).length ? JSON.stringify(colors) : null, nowSec(), actor.householdId)
      .run()
  }

  // Storage locations for La réserve: a {id, name, color?} list. Only valid
  // entries survive. An explicit list (incl. an empty one = "removed them all")
  // is stored verbatim — we never auto-clear back to NULL, so the household's
  // "no locations" choice sticks instead of reverting to the seeded defaults.
  if (body && 'reserveLocations' in body) {
    const locations = cleanReserveLocations(body.reserveLocations)
    await ctx.env.DB.prepare('UPDATE households SET reserve_locations = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(locations), nowSec(), actor.householdId)
      .run()
  }

  // The household AI on/off switch (Réglages ▸ IA, migration 0061). Stored as
  // 1 = on / 0 = off; NULL never written from here (only legacy rows are NULL,
  // which read as on). Folded into /api/health's effective `ai` flag.
  if (body && 'aiEnabled' in body) {
    await ctx.env.DB.prepare('UPDATE households SET ai_enabled = ?, updated_at = ? WHERE id = ?')
      .bind(body.aiEnabled ? 1 : 0, nowSec(), actor.householdId)
      .run()
  }

  const name = await householdName(ctx.env, actor.householdId)
  const postal = await householdPostal(ctx.env, actor.householdId)
  const includedStores = await householdIncludedStores(ctx.env, actor.householdId)
  const meals = await householdMealSlotPrefs(ctx.env, actor.householdId)
  const measureColors = await householdMeasureColors(ctx.env, actor.householdId)
  const reserveLocations = await householdReserveLocations(ctx.env, actor.householdId)
  const aiEnabled = await householdAiEnabled(ctx.env, actor.householdId)
  return ok({
    name,
    postal,
    includedStores,
    mealColors: meals.colors,
    mealHidden: meals.hidden,
    measureColors,
    reserveLocations,
    aiEnabled,
  })
})
