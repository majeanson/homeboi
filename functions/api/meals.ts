import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, localDayOfWeek, newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { ingredientName } from '../_lib/ingredient'

// Meal plan as a 10-day countdown. The planning block is re-anchored every
// Tuesday (UTC, getUTCDay: Tue=2): each block spans its Tuesday through Tuesday+9
// (10 inclusive days). Past days within the block drop off, so the visible window
// is today..blockEnd — it shrinks 10 → 4 across the week, then snaps back to 10
// each Tuesday (Monday-midnight reset). A day has four slots — déjeuner / dîner /
// souper / collation (breakfast/lunch/supper/snack); the client groups per day.
// A slot can hold SEVERAL meals (migration 0033): each is a row, ordered by
// `position` within the slot. `supper` stays primary (board headline, kid
// suggestions, shop-the-week). Setting a meal optionally pushes "missing" staples
// to the shared list (the meal -> grocery flow); the staples list is sent by the
// client since the prototype has no recipe DB.
const SLOTS = new Set(['breakfast', 'lunch', 'supper', 'snack'])
const slotOf = (v: unknown): string => (typeof v === 'string' && SLOTS.has(v) ? v : 'supper')

// Display/sort order is by TIME of day: déjeuner, dîner, collation, souper. Keep
// in sync with SLOT_RANK in src/lib/mealSlots.ts. Used by every meal read so the
// list never reshuffles between the kitchen grid, the board and the month.
const SLOT_CASE =
  "CASE slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 WHEN 'supper' THEN 3 ELSE 9 END"
const MEAL_ORDER = `${SLOT_CASE}, position, created_at, id`

const DAY = 86400
// Days remaining in the active block, counting today. = 10 - (days since the
// block's Tuesday). Ranges 10 (on Tuesday) down to 4 (on Monday). Local
// day-of-week so the block re-anchors at LOCAL Tuesday midnight, not 8 PM.
const windowDaysFor = (today: number): number => {
  const sinceTue = (localDayOfWeek(new Date(today * 1000)) - 2 + 7) % 7
  return 10 - sinceTue
}

export const onRequestGet = authed(async (ctx, actor) => {
  const today = localDayStart(new Date(Date.now()))
  const windowDays = windowDaysFor(today)
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, date, slot, title, cook_member_id, suggested_by, recipe_id, position, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date, ${MEAL_ORDER}`,
  )
    .bind(actor.householdId, today, today + DAY * windowDays)
    .all()
  return ok({ days: results, weekStart: today, windowDays })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    action?: 'move' | 'clear'
    // move
    id?: string
    dir?: 'up' | 'down'
    // clear (slot optional → clear the whole day)
    date?: number
    slot?: string // breakfast | lunch | supper | snack (default supper)
    // add / suggest
    title?: string
    cookMemberId?: string
    recipeId?: string // optional: the saved recipe this slot points at
    staples?: string[]
    suggest?: boolean // a kid's pick — recorded with suggested_by
    suggestedBy?: string // the child's member id, for "suggéré par X"
    isLeftover?: boolean // announce-from-a-meal WITH a day: a planned leftover (badged "Restants")
    sourceMealId?: string // optional provenance — the meal it was left over from
  }>(ctx.request)

  // ── Reorder within a slot: ↑/↓ one step. Renumber the whole slot densely by
  //    current order then swap the target with its neighbour — self-heals any
  //    position collisions and is trivial for these tiny lists. No-op at edges.
  if (body?.action === 'move') {
    if (!body.id || (body.dir !== 'up' && body.dir !== 'down')) return badRequest('id + dir requis.')
    const target = await ctx.env.DB.prepare(
      'SELECT date, slot FROM meals WHERE id = ? AND household_id = ?',
    )
      .bind(body.id, actor.householdId)
      .first<{ date: number; slot: string }>()
    if (!target) return ok({ ok: true }) // gone already — nothing to move
    const { results } = await ctx.env.DB.prepare(
      `SELECT id FROM meals WHERE household_id = ? AND date = ? AND slot = ? ORDER BY position, created_at, id`,
    )
      .bind(actor.householdId, target.date, target.slot)
      .all<{ id: string }>()
    const ids = results.map((r) => r.id)
    const i = ids.indexOf(body.id)
    const j = body.dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return ok({ ok: true }) // at the edge
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await ctx.env.DB.batch(
      ids.map((id, pos) =>
        ctx.env.DB.prepare('UPDATE meals SET position = ? WHERE id = ? AND household_id = ?').bind(
          pos,
          id,
          actor.householdId,
        ),
      ),
    )
    return ok({ ok: true })
  }

  // ── Clear a whole slot (date+slot) or a whole day (date only).
  if (body?.action === 'clear') {
    if (typeof body.date !== 'number') return badRequest('date requise.')
    const date = localDayStart(new Date(body.date * 1000))
    const res = body.slot
      ? await ctx.env.DB.prepare('DELETE FROM meals WHERE household_id = ? AND date = ? AND slot = ?')
          .bind(actor.householdId, date, slotOf(body.slot))
          .run()
      : await ctx.env.DB.prepare('DELETE FROM meals WHERE household_id = ? AND date = ?')
          .bind(actor.householdId, date)
          .run()
    return ok({ ok: true, cleared: res.meta.changes })
  }

  // ── Add a meal (parent set OR kid suggestion) — both APPEND to the slot now
  //    (a slot is a list). position = MAX(position)+1 within the slot, computed
  //    in the same statement so concurrent adds can't read a stale max (and even
  //    a tie is harmless — reads break ties on created_at,id, reorder renumbers).
  if (typeof body?.date !== 'number' || !body.title?.trim()) return badRequest('date + titre requis.')
  const title = body.title.trim()
  const slot = slotOf(body.slot)
  const date = localDayStart(new Date(body.date * 1000))
  const recipeId = body.recipeId?.trim() || null
  const ts = nowSec()

  await ctx.env.DB.prepare(
    `INSERT INTO meals (id, household_id, date, slot, title, cook_member_id, suggested_by, recipe_id, created_at, position, is_leftover)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?
     FROM meals WHERE household_id = ? AND date = ? AND slot = ?`,
  )
    .bind(
      newId(),
      actor.householdId,
      date,
      slot,
      title,
      body.suggest ? null : (body.cookMemberId ?? null),
      body.suggest ? (body.suggestedBy ?? null) : null,
      recipeId,
      ts,
      body.isLeftover ? 1 : 0,
      actor.householdId,
      date,
      slot,
    )
    .run()

  if (body.suggest) return ok({ ok: true, suggested: true })

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

// Edit ONE meal in place — rename / relink a recipe / reassign the cook —
// without delete+recreate (which would lose its position and suggested_by).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; title?: string; recipeId?: string | null; cookMemberId?: string | null }>(
    ctx.request,
  )
  if (!body?.id) return badRequest('id requis.')
  const sets: string[] = []
  const vals: unknown[] = []
  if (typeof body.title === 'string') {
    const t = body.title.trim()
    if (!t) return badRequest('titre vide.')
    sets.push('title = ?')
    vals.push(t)
  }
  if (body.recipeId !== undefined) {
    sets.push('recipe_id = ?')
    vals.push(body.recipeId?.trim() || null)
  }
  if (body.cookMemberId !== undefined) {
    sets.push('cook_member_id = ?')
    vals.push(body.cookMemberId || null)
  }
  if (!sets.length) return badRequest('rien à modifier.')
  await ctx.env.DB.prepare(`UPDATE meals SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...vals, body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM meals WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
