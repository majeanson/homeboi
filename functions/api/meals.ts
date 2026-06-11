import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart, newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { ingredientName } from '../_lib/ingredient'

// Weekly meal plan. A day has four slots — déjeuner / dîner / souper / collation
// (breakfast/lunch/supper/snack). GET returns every planned slot for the next 7
// days; the client groups them per day. `supper` stays primary (board headline,
// kid suggestions, shop-the-week). Setting a meal optionally pushes "missing"
// staples to the shared list (the meal -> grocery flow); the staples list is sent
// by the client since the prototype has no recipe DB.
const SLOTS = new Set(['breakfast', 'lunch', 'supper', 'snack'])
const slotOf = (v: unknown): string => (typeof v === 'string' && SLOTS.has(v) ? v : 'supper')

export const onRequestGet = authed(async (ctx, actor) => {
  const today = dayStart(new Date(Date.now()))
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, date, slot, title, cook_member_id, suggested_by FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date',
  )
    .bind(actor.householdId, today, today + 86400 * 7)
    .all()
  return ok({ days: results, weekStart: today })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    date?: number
    slot?: string // breakfast | lunch | supper | snack (default supper)
    title?: string
    cookMemberId?: string
    staples?: string[]
    suggest?: boolean // a kid's pick — fill an empty slot only, never replace
    suggestedBy?: string // the child's member id, for "suggéré par X"
  }>(ctx.request)
  if (typeof body?.date !== 'number' || !body.title?.trim()) return badRequest('date + titre requis.')
  const title = body.title.trim()
  const slot = slotOf(body.slot)
  const date = dayStart(new Date(body.date * 1000))
  const ts = nowSec()

  // Kid suggestion: a child's pick only fills an EMPTY slot — it never overwrites
  // a meal a parent (or an earlier suggestion) already set. Recorded with
  // suggested_by so a parent sees who suggested it and can keep or change it. The
  // meals_day_unique index (0014, on date+slot) makes this atomic: two devices
  // racing the same empty slot can't both land — the loser's insert is ignored.
  if (body.suggest) {
    const res = await ctx.env.DB.prepare(
      'INSERT OR IGNORE INTO meals (id, household_id, date, slot, title, cook_member_id, suggested_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(newId(), actor.householdId, date, slot, title, null, body.suggestedBy ?? null, ts)
      .run()
    return ok({ ok: true, suggested: res.meta.changes > 0 })
  }

  // Parent set: one meal per day+slot — replace any existing one (suggested_by
  // clears back to null on this fresh insert, since it's now a decision). Batched
  // so the delete+insert is one atomic transaction — a suggest landing between
  // them can't double-book the slot against the unique index.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM meals WHERE household_id = ? AND slot = ? AND date = ?').bind(
      actor.householdId,
      slot,
      date,
    ),
    ctx.env.DB.prepare(
      'INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(newId(), actor.householdId, date, slot, title, body.cookMemberId ?? null, ts),
  ])

  // meal -> grocery list: drop any staples the client flagged as missing.
  const staples = (body.staples ?? []).map((s) => ingredientName(s)).filter(Boolean).slice(0, 20)
  if (staples.length) {
    const addedBy = profileMemberId(ctx.request)
    await ctx.env.DB.batch(
      staples.map((item) =>
        ctx.env.DB.prepare(
          'INSERT INTO list_items (id, household_id, text, source, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(newId(), actor.householdId, item, 'meal', addedBy, ts),
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
