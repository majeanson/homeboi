import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, newId, nowSec } from '../_lib/ids'

// "Restants" (leftovers) — the UNDATED pool. A leftover dish you want to finish
// but haven't pinned to a day yet; it surfaces as a calm "eat these first"
// reminder on the board + kitchen. Like pantry_use_soon, marking one does NOT
// touch the shopping list (you already have the food). Planning one onto a day
// CONSUMES it: it becomes a real meals row tagged is_leftover (see action 'plan')
// — you eat leftovers once, so unlike meal_ideas the pool row is removed.
const SLOTS = new Set(['breakfast', 'lunch', 'supper', 'snack', 'dessert'])
const slotOf = (v: unknown): string => (typeof v === 'string' && SLOTS.has(v) ? v : 'supper')

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, recipe_id, source_meal_id, created_at FROM meal_leftovers WHERE household_id = ? ORDER BY created_at DESC',
  )
    .bind(actor.householdId)
    .all()
  return ok({ leftovers: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    action?: 'plan'
    // plan: pin a pool leftover onto a day (consumes the pool row)
    id?: string
    date?: number
    slot?: string
    // add (default): a new undated leftover
    title?: string
    recipeId?: string
    sourceMealId?: string
  }>(ctx.request)

  // ── Plan: a pool leftover becomes a real meal on the chosen day, tagged
  //    is_leftover. Append to the slot (dense position computed in-statement, same
  //    as meals.ts add), then delete the pool row — leftovers are consumed, not
  //    reusable like meal_ideas.
  if (body?.action === 'plan') {
    if (!body.id || typeof body.date !== 'number') return badRequest('id + date requis.')
    const row = await ctx.env.DB.prepare(
      'SELECT title, recipe_id FROM meal_leftovers WHERE id = ? AND household_id = ?',
    )
      .bind(body.id, actor.householdId)
      .first<{ title: string; recipe_id: string | null }>()
    if (!row) return ok({ ok: true }) // gone already
    const slot = slotOf(body.slot)
    const date = localDayStart(new Date(body.date * 1000))
    // Keep the new meal id so the client can offer a compensating undo (delete the
    // meal + re-insert the pool row) — planning consumes the pool entry.
    const mealId = newId()
    await ctx.env.DB.prepare(
      `INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, suggested_by, recipe_id, created_at, position, is_leftover)
       SELECT ?, ?, ?, ?, ?, NULL, NULL, ?, ?, COALESCE(MAX(position), -1) + 1, 1
       FROM meals WHERE household_id = ? AND date = ? AND slot = ?`,
    )
      .bind(mealId, actor.householdId, date, slot, row.title, row.recipe_id, nowSec(), actor.householdId, date, slot)
      .run()
    await ctx.env.DB.prepare('DELETE FROM meal_leftovers WHERE id = ? AND household_id = ?')
      .bind(body.id, actor.householdId)
      .run()
    return ok({ ok: true, planned: true, mealId, title: row.title })
  }

  // ── Add an undated leftover to the pool. Returns the new id so the client can
  //    offer a compensating undo (delete by id) for an announce-from-a-meal tap.
  const title = body?.title?.trim().slice(0, 200)
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO meal_leftovers (id, household_id, title, recipe_id, source_meal_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, title, body?.recipeId?.trim() || null, body?.sourceMealId?.trim() || null, nowSec())
    .run()
  return ok({ ok: true, id })
})

// Rename a pool leftover in place (the uniform ✏️ affordance).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; title?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const title = body.title?.trim()
  if (!title) return badRequest('Titre requis.')
  await ctx.env.DB.prepare('UPDATE meal_leftovers SET title = ? WHERE id = ? AND household_id = ?')
    .bind(title.slice(0, 200), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})

// "Fini / mangé" — the leftover is gone.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM meal_leftovers WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
