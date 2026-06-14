import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// "À utiliser bientôt" — things you HAVE and want to finish (the complement of
// pantry-low). Unlike pantry-low, marking one does NOT add it to the shopping
// list (you already have it); it only feeds the kitchen's "use it up" recipe
// ranking. Clearing removes it (you used or tossed it).
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, item, marked_at FROM pantry_use_soon WHERE household_id = ? ORDER BY marked_at DESC',
  )
    .bind(actor.householdId)
    .all()
  return ok({ soon: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ item?: string }>(ctx.request)
  const item = body?.item?.trim().slice(0, 200)
  if (!item) return badRequest('Aliment requis.')
  await ctx.env.DB.prepare('INSERT INTO pantry_use_soon (id, household_id, item, marked_at) VALUES (?, ?, ?, ?)')
    .bind(newId(), actor.householdId, item, nowSec())
    .run()
  return ok({ ok: true })
})

// Rename a use-soon item in place (the ✏️ affordance) — the uniform edit every
// list row offers.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; item?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const item = body.item?.trim()
  if (!item) return badRequest('Aliment requis.')
  await ctx.env.DB.prepare('UPDATE pantry_use_soon SET item = ? WHERE id = ? AND household_id = ?')
    .bind(item.slice(0, 200), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM pantry_use_soon WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
