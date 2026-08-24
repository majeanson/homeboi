import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart } from '../_lib/ids'
import { householdMealLayout, mealOrderSql } from '../_lib/mealSlots'

// « Historique » — every planned meal, newest day first, since the household
// began. The meals table never deletes past rows (the 10-day countdown window
// in /api/meals just stops reading them), so this is a pure paged read over
// what already exists. Cold-path like /api/year: fetched when the tab opens,
// never polled (D-18). ZERO AI: a pure D1 read (NFR-PERF-1).
//
// Pagination is BY DAY, not by row, so a day's meals are never split across
// pages (the client groups by day → month and a torn day would render twice):
// each page is up to PAGE_DAYS distinct planned days. `?before=` is an
// exclusive local-midnight upper bound; the response's `nextBefore` is the
// value to pass for the next (older) page, or null when history is exhausted.
const DAY = 86400
const PAGE_DAYS = 14

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const today = localDayStart(new Date(Date.now()))
  const url = new URL(ctx.request.url)
  const rawBefore = Math.floor(Number(url.searchParams.get('before')))
  // Default/first page starts at today (inclusive — today's plan is already
  // "what we're eating"); clamp so the future stays the week grid's job and a
  // bad param degrades to page one rather than a 400 (the month read's rule).
  const before =
    Number.isFinite(rawBefore) && rawBefore > 0 ? Math.min(rawBefore, today + DAY) : today + DAY

  // The distinct planned days of this page first (empty days simply don't
  // exist here), then every meal on them — sorted by the household's slot
  // order (Réglages ▸ Repas) so a day reads like the kitchen grid and the
  // month view, never a reshuffle.
  const { results: dayRows } = await ctx.env.DB.prepare(
    'SELECT DISTINCT date FROM meals WHERE household_id = ? AND date < ? ORDER BY date DESC LIMIT ?',
  )
    .bind(hh, before, PAGE_DAYS + 1)
    .all<{ date: number }>()
  if (dayRows.length === 0) return ok({ days: [], nextBefore: null })

  const hasMore = dayRows.length > PAGE_DAYS
  const page = hasMore ? dayRows.slice(0, PAGE_DAYS) : dayRows
  const oldest = page[page.length - 1].date

  const MEAL_ORDER = mealOrderSql((await householdMealLayout(ctx.env, hh)).order)
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, date, slot, title, cook_member_id, suggested_by, recipe_id, position, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date DESC, ${MEAL_ORDER}`,
  )
    .bind(hh, oldest, before)
    .all()

  return ok({ days: results, nextBefore: hasMore ? oldest : null })
})
