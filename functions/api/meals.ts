import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart, newId, nowSec } from '../_lib/ids'

// Weekly meal plan (supper slots). GET returns the next 7 days. POST sets a
// slot. Setting a meal optionally pushes "missing" staples to the shared list
// (the meal -> grocery flow); the staples list is sent by the client since the
// prototype has no recipe DB.
export const onRequestGet = authed(async (ctx, actor) => {
  const today = dayStart(new Date(Date.now()))
  const { results } = await ctx.env.DB.prepare(
    "SELECT id, date, slot, title, cook_member_id FROM meals WHERE household_id = ? AND slot = 'supper' AND date >= ? AND date < ? ORDER BY date",
  )
    .bind(actor.householdId, today, today + 86400 * 7)
    .all()
  return ok({ days: results, weekStart: today })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    date?: number
    title?: string
    cookMemberId?: string
    staples?: string[]
  }>(ctx.request)
  if (typeof body?.date !== 'number' || !body.title?.trim()) return badRequest('date + titre requis.')
  const title = body.title.trim()
  const date = dayStart(new Date(body.date * 1000))
  const ts = nowSec()

  // One supper per day: replace any existing one for that date.
  await ctx.env.DB.prepare("DELETE FROM meals WHERE household_id = ? AND slot = 'supper' AND date = ?")
    .bind(actor.householdId, date)
    .run()
  await ctx.env.DB.prepare(
    'INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, date, 'supper', title, body.cookMemberId ?? null, ts)
    .run()

  // meal -> grocery list: drop any staples the client flagged as missing.
  const staples = (body.staples ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 20)
  if (staples.length) {
    await ctx.env.DB.batch(
      staples.map((item) =>
        ctx.env.DB.prepare(
          'INSERT INTO list_items (id, household_id, text, source, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(newId(), actor.householdId, item, 'meal', ts),
      ),
    )
  }
  return ok({ ok: true, addedToList: staples.length })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM meals WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
