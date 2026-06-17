import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'

// Family "favorites" hearts (#21). Who loves which recipe — a preference signal
// the meal suggester leans on, NEVER a count/rank shown to anyone (calm).
//
//   GET    /api/recipe-loves -> { loves: [{recipe_id, member_id}] } (whole household)
//   POST   /api/recipe-loves { recipeId } -> add the ACTIVE profile's love
//   DELETE /api/recipe-loves { recipeId } -> remove it
//
// The lover is the X-Profile member (pick-your-face). Loving as "Maisonnée" (no
// face) is refused — there's no "you" to attribute; the UI hides the toggle then
// and only shows existing hearts. authed() lets a parent-mode kiosk heart too;
// guests are read-only (blocked centrally).
interface LoveRow {
  recipe_id: string
  member_id: string
}

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare('SELECT recipe_id, member_id FROM recipe_loves WHERE household_id = ?')
    .bind(actor.householdId)
    .all<LoveRow>()
  return ok({ loves: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ recipeId?: string }>(ctx.request)
  const recipeId = body?.recipeId?.trim()
  if (!recipeId) return badRequest('recipeId requis.')
  const member = profileMemberId(ctx.request)
  if (!member) return badRequest('Choisis un visage pour aimer une recette.')
  await ctx.env.DB.prepare(
    'INSERT OR IGNORE INTO recipe_loves (household_id, recipe_id, member_id, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(actor.householdId, recipeId, member, nowSec())
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ recipeId?: string }>(ctx.request)
  const recipeId = body?.recipeId?.trim()
  if (!recipeId) return badRequest('recipeId requis.')
  const member = profileMemberId(ctx.request)
  if (!member) return badRequest('Aucun visage actif.')
  await ctx.env.DB.prepare('DELETE FROM recipe_loves WHERE household_id = ? AND recipe_id = ? AND member_id = ?')
    .bind(actor.householdId, recipeId, member)
    .run()
  return ok({ ok: true })
})
