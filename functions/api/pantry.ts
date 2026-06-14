import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// "Low / out" only — never a full inventory (brief tenet 3). Marking something
// low ONLY records that it's running low — it does NOT touch the shared list.
// Putting it on the shopping list is a separate, explicit step: the user checks
// the item in "Ce qui s'achève", which adds it to the list and clears the low flag
// (see PantryTab.checkLowItem). So nothing reaches the list without a deliberate tap.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, item, marked_at FROM pantry_low WHERE household_id = ? ORDER BY marked_at DESC',
  )
    .bind(actor.householdId)
    .all()
  return ok({ low: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ item?: string }>(ctx.request)
  const item = body?.item?.trim()
  if (!item) return badRequest('Aliment requis.')
  await ctx.env.DB.prepare('INSERT INTO pantry_low (id, household_id, item, marked_at) VALUES (?, ?, ?, ?)')
    .bind(newId(), actor.householdId, item, nowSec())
    .run()
  return ok({ ok: true })
})

// Rename a low item in place (the ✏️ affordance) — same uniform edit every list
// row offers, without removing + re-adding (which would reshuffle marked_at order).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; item?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const item = body.item?.trim()
  if (!item) return badRequest('Aliment requis.')
  await ctx.env.DB.prepare('UPDATE pantry_low SET item = ? WHERE id = ? AND household_id = ?')
    .bind(item.slice(0, 200), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM pantry_low WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
