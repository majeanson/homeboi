import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart } from '../_lib/ids'
import { parseRecur, expandRange } from '../_lib/recur'

interface Ev {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
}
const sortEvents = (xs: Ev[]) => xs.sort((p, q) => q.all_day - p.all_day || p.start_at - q.start_at)

// The whole board in one read — the kiosk polls this. Deliberately one
// round-trip so a wall tablet on flaky wifi gets a complete frame or none.
// ZERO AI here (NFR-PERF-1): this is a pure D1 read on the render path.
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId

  const today = dayStart(new Date(Date.now()))
  const tomorrow = today + 86400
  const dayAfter = today + 86400 * 2
  const weekEnd = today + 86400 * 7

  const [members, todayEvents, tomorrowEvents, tonightMeal, tomorrowMeal, openList, chores] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY all_day DESC, start_at',
    )
      .bind(hh, today, tomorrow)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY all_day DESC, start_at',
    )
      .bind(hh, tomorrow, dayAfter)
      .all(),
    ctx.env.DB.prepare(
      "SELECT id, title, cook_member_id FROM meals WHERE household_id = ? AND slot = 'supper' AND date >= ? AND date < ? LIMIT 1",
    )
      .bind(hh, today, tomorrow)
      .all(),
    ctx.env.DB.prepare(
      "SELECT id, title, cook_member_id FROM meals WHERE household_id = ? AND slot = 'supper' AND date >= ? AND date < ? LIMIT 1",
    )
      .bind(hh, tomorrow, dayAfter)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, text, source FROM list_items WHERE household_id = ? AND checked_at IS NULL ORDER BY created_at',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, rotation_json, current_idx, last_done_at, color FROM tasks WHERE household_id = ? ORDER BY created_at',
    )
      .bind(hh)
      .all(),
  ])

  // "Up next" beyond tomorrow (rest of the week) — tomorrow has its own card, so
  // start the day after to avoid showing it twice.
  const upcoming = await ctx.env.DB.prepare(
    'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 8',
  )
    .bind(hh, dayAfter, weekEnd)
    .all()

  // Recurring series live as one row each; expand them across the board window
  // (today → week end) into concrete occurrences, then bucket into the same
  // day ranges as the one-off events above. See _lib/recur.
  const recurring = await ctx.env.DB.prepare(
    'SELECT id, title, start_at, all_day, member_id, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
  )
    .bind(hh)
    .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; recur_json: string }>()

  const occurrences: Ev[] = []
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, today, weekEnd)) {
      occurrences.push({ id: `${e.id}#${at}`, title: e.title, start_at: at, all_day: e.all_day, member_id: e.member_id })
    }
  }
  const recurIn = (from: number, to: number) => occurrences.filter((e) => e.start_at >= from && e.start_at < to)

  const todayMerged = sortEvents([...(todayEvents.results as unknown as Ev[]), ...recurIn(today, tomorrow)])
  const tomorrowMerged = sortEvents([...(tomorrowEvents.results as unknown as Ev[]), ...recurIn(tomorrow, dayAfter)])
  const upcomingMerged = sortEvents([...(upcoming.results as unknown as Ev[]), ...recurIn(dayAfter, weekEnd)]).slice(0, 8)

  // Recent helpers per chore (shared-task attribution). Today's contributions
  // only, so "aidé par" reflects who pitched in on the current run, not history.
  const helps = await ctx.env.DB.prepare(
    `SELECT tp.task_id, tp.role, m.display_name AS name
       FROM task_participants tp
       LEFT JOIN members m ON m.id = tp.member_id
      WHERE tp.contributed_at >= ?
        AND tp.task_id IN (SELECT id FROM tasks WHERE household_id = ?)
      ORDER BY tp.contributed_at DESC`,
  )
    .bind(today, hh)
    .all<{ task_id: string; role: string; name: string | null }>()

  // Distinct helpers per chore: collapse repeat taps so "aidé par" shows each
  // person once (named people by name; anonymous taps as a single role emoji),
  // not one entry per tap. No counts — that would read as a score (NFR-CALM-1).
  const helpersByTask = new Map<string, { name: string | null; role: string }[]>()
  const seenByTask = new Map<string, Set<string>>()
  for (const h of helps.results) {
    const list = helpersByTask.get(h.task_id) ?? []
    const seen = seenByTask.get(h.task_id) ?? new Set<string>()
    const key = h.name ?? `role:${h.role}`
    if (!seen.has(key) && list.length < 5) {
      seen.add(key)
      list.push({ name: h.name, role: h.role })
    }
    helpersByTask.set(h.task_id, list)
    seenByTask.set(h.task_id, seen)
  }
  const choresOut = (chores.results as { id: string }[]).map((c) => ({
    ...c,
    helpers: helpersByTask.get(c.id) ?? [],
  }))

  return ok({
    syncedAt: Math.floor(Date.now() / 1000),
    scope: actor.scope,
    members: members.results,
    today: todayMerged,
    tomorrow: tomorrowMerged,
    upcoming: upcomingMerged,
    tonight: tonightMeal.results[0] ?? null,
    tomorrowMeal: tomorrowMeal.results[0] ?? null,
    list: openList.results,
    chores: choresOut,
  })
})
