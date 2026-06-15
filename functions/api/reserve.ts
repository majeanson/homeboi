import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// La réserve — a reminder list of items stashed in the freezer / back of the
// pantry (the stuff that's "behind everything" and gets forgotten). Same minimal
// shape as pantry_use_soon plus a soft location_id (which storage spot it's in;
// the spots live on the household as reserve_locations). Like use-soon, it is NOT
// an inventory (no count) and marking/clearing never touches the shopping list —
// clearing just means "used it / tossed it".
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, item, location_id, marked_at FROM pantry_reserve WHERE household_id = ? ORDER BY marked_at DESC',
  )
    .bind(actor.householdId)
    .all()
  return ok({ reserve: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ item?: string; location_id?: string | null }>(ctx.request)
  const item = body?.item?.trim().slice(0, 200)
  if (!item) return badRequest('Aliment requis.')
  const locationId = typeof body?.location_id === 'string' ? body.location_id.trim().slice(0, 40) || null : null
  await ctx.env.DB.prepare(
    'INSERT INTO pantry_reserve (id, household_id, item, location_id, marked_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, item, locationId, nowSec())
    .run()
  return ok({ ok: true })
}, 'operator')

// Rename a reserve item and/or move it to another location (the ✏️ affordance).
// Each field is only touched when present, so a rename and a move are independent.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; item?: string; location_id?: string | null }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  if ('item' in body) {
    const item = body.item?.trim()
    if (!item) return badRequest('Aliment requis.')
    await ctx.env.DB.prepare('UPDATE pantry_reserve SET item = ? WHERE id = ? AND household_id = ?')
      .bind(item.slice(0, 200), body.id, actor.householdId)
      .run()
  }
  if ('location_id' in body) {
    const locationId = typeof body.location_id === 'string' ? body.location_id.trim().slice(0, 40) || null : null
    await ctx.env.DB.prepare('UPDATE pantry_reserve SET location_id = ? WHERE id = ? AND household_id = ?')
      .bind(locationId, body.id, actor.householdId)
      .run()
  }
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM pantry_reserve WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
