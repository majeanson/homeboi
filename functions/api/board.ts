import type { Env } from '../_lib/env'
import { ok } from '../_lib/json'
import { requireActor } from '../_lib/household'
import { dayStart } from '../_lib/ids'

// The whole board in one read — the kiosk polls this. Deliberately one
// round-trip so a wall tablet on flaky wifi gets a complete frame or none.
// ZERO AI here (NFR-PERF-1): this is a pure D1 read on the render path.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const hh = actor.householdId

  const today = dayStart(new Date(Date.now()))
  const tomorrow = today + 86400
  const weekEnd = today + 86400 * 7

  const [members, todayEvents, tonightMeal, openList, chores] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT id, display_name, avatar_kind, avatar_ref, is_child FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND start_at >= ? AND start_at < ? ORDER BY all_day DESC, start_at',
    )
      .bind(hh, today, tomorrow)
      .all(),
    ctx.env.DB.prepare(
      "SELECT id, title, cook_member_id FROM meals WHERE household_id = ? AND slot = 'supper' AND date >= ? AND date < ? LIMIT 1",
    )
      .bind(hh, today, tomorrow)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, text, source FROM list_items WHERE household_id = ? AND checked_at IS NULL ORDER BY created_at',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, rotation_json, current_idx, last_done_at FROM tasks WHERE household_id = ? ORDER BY created_at',
    )
      .bind(hh)
      .all(),
  ])

  // Upcoming events (next 7 days, excluding today) for the secondary strip.
  const upcoming = await ctx.env.DB.prepare(
    'SELECT id, title, start_at, all_day FROM events WHERE household_id = ? AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 8',
  )
    .bind(hh, tomorrow, weekEnd)
    .all()

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

  const helpersByTask = new Map<string, { name: string | null; role: string }[]>()
  for (const h of helps.results) {
    const list = helpersByTask.get(h.task_id) ?? []
    if (list.length < 5) list.push({ name: h.name, role: h.role })
    helpersByTask.set(h.task_id, list)
  }
  const choresOut = (chores.results as { id: string }[]).map((c) => ({
    ...c,
    helpers: helpersByTask.get(c.id) ?? [],
  }))

  return ok({
    syncedAt: Math.floor(Date.now() / 1000),
    scope: actor.scope,
    members: members.results,
    today: todayEvents.results,
    upcoming: upcoming.results,
    tonight: tonightMeal.results[0] ?? null,
    list: openList.results,
    chores: choresOut,
  })
}
