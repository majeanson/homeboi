import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// The "general ideas" pool (see migration 0025). A reusable shortlist of meal
// ideas not yet pinned to a day — free text ("tacos") or a saved-recipe shortcut
// (recipe_id set). Generalizes the toddler "suggest a meal" path: a suggestion
// can land here for anyone to plan onto a real day later, instead of only filling
// an empty slot. Planning an idea writes a meals row but LEAVES the idea here —
// ideas are reusable, not consumed.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, recipe_id, suggested_by, created_at FROM meal_ideas WHERE household_id = ? ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all()
  return ok({ ideas: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    title?: string
    recipeId?: string // optional: the saved recipe this idea points at
    suggestedBy?: string // optional: member id who added it
  }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO meal_ideas (id, household_id, title, recipe_id, suggested_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, title, body?.recipeId?.trim() || null, body?.suggestedBy ?? null, nowSec())
    .run()
  return ok({ id, title })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM meal_ideas WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
