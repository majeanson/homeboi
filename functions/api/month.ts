import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart } from '../_lib/ids'
import { parseRecur, expandRange, rotationOffset } from '../_lib/recur'

// Everything dated in the household, for a calendar-month window. /api/board is
// the 7-day glance; the month view zooms out, so it needs its own read across an
// arbitrary [from, to) day range. Same item families the board surfaces — events
// (one-off + recurring), meals, recurring chores, day-notes — expanded and
// bucketed onto a LOCAL day key the client groups by (matching lib/monthgrid +
// the meal week — local midnight, DST-aware, so an evening event lands on the day
// the household is living, not the next UTC day). Fridge notes are deliberately
// absent: they carry no date (always-active), so they have no calendar cell.
// ZERO AI: a pure D1 read, same as the board (NFR-PERF-1).
const DAY = 86400
const MAX_DAYS = 45 // a 6-week grid is 42 days; cap the expansion cost regardless.

const dayOf = (at: number) => localDayStart(new Date(at * 1000))

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const url = new URL(ctx.request.url)
  const from = Math.floor(Number(url.searchParams.get('from')))
  let to = Math.floor(Number(url.searchParams.get('to')))
  // Bad/missing window → empty calendar rather than a 400; the view just shows
  // empty cells, mirroring how the board tolerates a thin frame.
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from) {
    return ok({ events: [], meals: [], chores: [], dayNotes: [] })
  }
  to = Math.min(to, from + MAX_DAYS * DAY)

  const [members, oneOff, recurring, mealsRes, dayNotesRes, choresRes, todosRes] = await Promise.all([
    ctx.env.DB.prepare('SELECT id, display_name FROM members WHERE household_id = ?')
      .bind(hh)
      .all<{ id: string; display_name: string }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ?',
    )
      .bind(hh, from, to)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; recur_json: string }>(),
    // Meals & day-notes are stored at LOCAL midnight; widen the SQL window a day
    // each side so an entry near the window edge still lands, then re-bucket by
    // local day below and clip back to [from, to).
    ctx.env.DB.prepare(
      "SELECT id, slot, title, cook_member_id, date, position, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date, CASE slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 WHEN 'supper' THEN 3 ELSE 9 END, position, created_at, id",
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; slot: string; title: string; cook_member_id: string | null; date: number; position: number; is_leftover: number }>(),
    ctx.env.DB.prepare(
      'SELECT id, text, member_id, date FROM day_notes WHERE household_id = ? AND date >= ? AND date < ?',
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; text: string; member_id: string | null; date: number }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, color, rotation_json, current_idx, last_done_at, recur_json, recur_start, created_at FROM tasks WHERE household_id = ?',
    )
      .bind(hh)
      .all<{
        id: string
        title: string
        color: string | null
        rotation_json: string
        current_idx: number
        last_done_at: number | null
        recur_json: string | null
        recur_start: number | null
        created_at: number
      }>(),
    // À compléter todos pinned to a DAY (migration 0046/0047) — open ones only, so
    // the calendar shows what's still to do. `day` is already local midnight, so a
    // direct range match works (no ±DAY re-bucket needed). Global (day NULL) todos
    // have no calendar cell, like fridge notes.
    ctx.env.DB.prepare(
      'SELECT id, title, member_id, day, section FROM todos WHERE household_id = ? AND day IS NOT NULL AND day >= ? AND day < ? AND done_at IS NULL ORDER BY day, position, created_at',
    )
      .bind(hh, from, to)
      .all<{ id: string; title: string; member_id: string | null; day: number; section: string | null }>(),
  ])

  const inRange = (day: number) => day >= from && day < to

  const events: { id: string; title: string; at: number; all_day: number; member_id: string | null; day: number }[] = []
  for (const e of oneOff.results) {
    const day = dayOf(e.start_at)
    if (inRange(day)) events.push({ id: e.id, title: e.title, at: e.start_at, all_day: e.all_day, member_id: e.member_id, day })
  }
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, from, to)) {
      events.push({ id: `${e.id}#${at}`, title: e.title, at, all_day: e.all_day, member_id: e.member_id, day: dayOf(at) })
    }
  }

  const meals: { id: string; slot: string; title: string; cook_member_id: string | null; day: number; is_leftover?: number }[] = []
  for (const m of mealsRes.results) {
    const day = dayOf(m.date)
    if (inRange(day)) meals.push({ id: m.id, slot: m.slot, title: m.title, cook_member_id: m.cook_member_id, day, is_leftover: m.is_leftover })
  }

  const dayNotes: { id: string; text: string; member_id: string | null; day: number }[] = []
  for (const n of dayNotesRes.results) {
    const day = dayOf(n.date)
    if (inRange(day)) dayNotes.push({ id: n.id, text: n.text, member_id: n.member_id, day })
  }

  // Dated todos — already bucketed on a local-midnight `day`, the same key the grid
  // groups by. (inRange is a belt-and-braces guard; the SQL already bounds it.)
  const todos: { id: string; title: string; member_id: string | null; day: number; section: string | null }[] = []
  for (const td of todosRes.results) {
    if (inRange(td.day)) todos.push({ id: td.id, title: td.title, member_id: td.member_id, day: td.day, section: td.section })
  }

  const nameOf = (id: string | null) => (id && members.results.find((m) => m.id === id)?.display_name) || null
  const parseRotation = (rotationJson: string): string[] => {
    try {
      const p = JSON.parse(rotationJson)
      if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string')
    } catch {
      /* malformed rotation → no turn */
    }
    return []
  }
  // Recurring chores expanded across the window. The rotation's stored current_idx
  // is the holder of the next PENDING occurrence and advances only on completion —
  // so we PROJECT it forward per occurrence (rotationOffset) instead of labelling
  // every future cell with today's holder. Non-recurring chores have no schedule,
  // so they never land on the calendar.
  const todayLocal = localDayStart(new Date())
  const chores: { id: string; title: string; color: string | null; who: string | null; day: number }[] = []
  for (const c of choresRes.results) {
    const r = parseRecur(c.recur_json)
    if (!r) continue
    const anchor = c.recur_start ?? c.created_at
    const rot = parseRotation(c.rotation_json)
    // If today's turn was already done, the pending holder is the NEXT occurrence,
    // so count from tomorrow; otherwise the next occurrence on/after today is it.
    const refDay = c.last_done_at != null && c.last_done_at >= todayLocal ? todayLocal + DAY : todayLocal
    const occs = expandRange(anchor, r, from, to)
    // Each occurrence advances the rotation by one, so resolve the offset of the
    // first occurrence in the window once, then just step it forward.
    let offset = occs.length ? rotationOffset(anchor, r, refDay, occs[0]) : 0
    for (const at of occs) {
      const who = rot.length ? nameOf(rot[(((c.current_idx + offset) % rot.length) + rot.length) % rot.length]) : null
      chores.push({ id: `${c.id}#${at}`, title: c.title, color: c.color, who, day: dayOf(at) })
      offset++
    }
  }

  return ok({ events, meals, chores, dayNotes, todos })
})
