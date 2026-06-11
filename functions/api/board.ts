import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart } from '../_lib/ids'
import { parseRecur, expandRange, occurrenceOn } from '../_lib/recur'

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

  const [members, todayEvents, tomorrowEvents, tonightMeal, tomorrowMeal, openList, doneList, chores, notes] = await Promise.all([
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
      'SELECT id, text, source, added_by, deal_json FROM list_items WHERE household_id = ? AND checked_at IS NULL ORDER BY created_at',
    )
      .bind(hh)
      .all(),
    // Recently checked-off items — the "done" shelf under the list, so a mis-tap
    // (or a changed mind) can be picked back up instead of being gone for good.
    ctx.env.DB.prepare(
      'SELECT id, text, source, added_by, checked_at FROM list_items WHERE household_id = ? AND checked_at IS NOT NULL ORDER BY checked_at DESC LIMIT 12',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, rotation_json, current_idx, last_done_at, color, recur_json, created_at FROM tasks WHERE household_id = ? ORDER BY created_at',
    )
      .bind(hh)
      .all(),
    // Fridge notes (uncleared), newest first — shown on the Aujourd'hui board.
    ctx.env.DB.prepare(
      'SELECT id, text, member_id, created_at FROM notes WHERE household_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 12',
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
  // JOIN (not IN-subquery) so the planner walks the household's few tasks via
  // tasks_household_idx, then task_participants_task_idx(task_id, contributed_at)
  // per task — this read rides the 10 s kiosk poll, it must stay index-only.
  const helps = await ctx.env.DB.prepare(
    `SELECT tp.task_id, tp.role, m.display_name AS name
       FROM task_participants tp
       JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
       LEFT JOIN members m ON m.id = tp.member_id
      WHERE tp.contributed_at >= ?
      ORDER BY tp.contributed_at DESC`,
  )
    .bind(hh, today)
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

  // Recurring chores expanded onto the day: those that occur TODAY (and aren't
  // already done today) surface on Aujourd'hui; otherwise the next occurrence in
  // the week surfaces on À venir. Whose-turn rides along (rotation + current_idx).
  // Non-recurring chores have no schedule, so they're left to the per-person
  // lanes (unchanged) and never auto-surfaced here.
  interface ChoreInst {
    id: string
    title: string
    color: string | null
    at: number
    who: string | null
  }
  const memberName = (id: string | null) =>
    (id && (members.results as { id: string; display_name: string }[]).find((m) => m.id === id)?.display_name) || null
  type ChoreSrc = {
    id: string
    title: string
    color: string | null
    rotation_json: string
    current_idx: number
    last_done_at: number | null
    recur_json: string | null
    created_at: number
  }
  const whoseTurn = (c: ChoreSrc): string | null => {
    let rot: string[] = []
    try {
      const p = JSON.parse(c.rotation_json)
      if (Array.isArray(p)) rot = p.filter((x): x is string => typeof x === 'string')
    } catch {
      /* malformed rotation → no turn */
    }
    return rot.length ? memberName(rot[c.current_idx % rot.length]) : null
  }
  const choresToday: ChoreInst[] = []
  const choresUpcoming: ChoreInst[] = []
  for (const c of chores.results as ChoreSrc[]) {
    const r = parseRecur(c.recur_json)
    if (!r) continue
    const inst = (at: number): ChoreInst => ({ id: c.id, title: c.title, color: c.color, at, who: whoseTurn(c) })
    if (occurrenceOn(today, c.created_at, r) !== null) {
      const doneToday = c.last_done_at != null && c.last_done_at >= today
      if (!doneToday) choresToday.push(inst(today))
    } else {
      const next = expandRange(c.created_at, r, tomorrow, weekEnd)[0]
      if (next != null) choresUpcoming.push(inst(next))
    }
  }
  choresUpcoming.sort((a, b) => a.at - b.at)

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
    listDone: doneList.results,
    chores: choresOut,
    choresToday,
    choresUpcoming,
    notes: notes.results,
  })
})
