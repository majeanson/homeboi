import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart } from '../_lib/ids'
import { parseRecur, expandRange } from '../_lib/recur'

// Everything dated in the household, for a calendar-month window. /api/board is
// the 7-day glance; the month view zooms out, so it needs its own read across an
// arbitrary [from, to) day range. Same item families the board surfaces — events
// (one-off + recurring), meals, recurring chores, day-notes — expanded and
// bucketed onto a UTC day key the client groups by. Fridge notes are deliberately
// absent: they carry no date (always-active), so they have no calendar cell.
// ZERO AI: a pure D1 read, same as the board (NFR-PERF-1).
const DAY = 86400
const MAX_DAYS = 45 // a 6-week grid is 42 days; cap the expansion cost regardless.

const dayOf = (at: number) => dayStart(new Date(at * 1000))

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

  const [members, oneOff, recurring, mealsRes, dayNotesRes, choresRes] = await Promise.all([
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
    // Meals & day-notes bucket at LOCAL midnight; widen the SQL window a day each
    // side so an entry near the UTC boundary still lands, then re-bucket by UTC
    // day below and clip back to [from, to).
    ctx.env.DB.prepare(
      "SELECT id, slot, title, cook_member_id, date, position FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date, CASE slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 WHEN 'supper' THEN 3 ELSE 9 END, position, created_at, id",
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; slot: string; title: string; cook_member_id: string | null; date: number; position: number }>(),
    ctx.env.DB.prepare(
      'SELECT id, text, member_id, date FROM day_notes WHERE household_id = ? AND date >= ? AND date < ?',
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; text: string; member_id: string | null; date: number }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, color, rotation_json, current_idx, recur_json, recur_start, created_at FROM tasks WHERE household_id = ?',
    )
      .bind(hh)
      .all<{
        id: string
        title: string
        color: string | null
        rotation_json: string
        current_idx: number
        recur_json: string | null
        recur_start: number | null
        created_at: number
      }>(),
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

  const meals: { id: string; slot: string; title: string; cook_member_id: string | null; day: number }[] = []
  for (const m of mealsRes.results) {
    const day = dayOf(m.date)
    if (inRange(day)) meals.push({ id: m.id, slot: m.slot, title: m.title, cook_member_id: m.cook_member_id, day })
  }

  const dayNotes: { id: string; text: string; member_id: string | null; day: number }[] = []
  for (const n of dayNotesRes.results) {
    const day = dayOf(n.date)
    if (inRange(day)) dayNotes.push({ id: n.id, text: n.text, member_id: n.member_id, day })
  }

  const nameOf = (id: string | null) => (id && members.results.find((m) => m.id === id)?.display_name) || null
  const whoseTurn = (rotationJson: string, idx: number): string | null => {
    let rot: string[] = []
    try {
      const p = JSON.parse(rotationJson)
      if (Array.isArray(p)) rot = p.filter((x): x is string => typeof x === 'string')
    } catch {
      /* malformed rotation → no turn */
    }
    return rot.length ? nameOf(rot[idx % rot.length]) : null
  }
  // Recurring chores expanded across the window. "Whose turn" is the rotation's
  // CURRENT holder (it only advances on completion, not per date), matching how
  // the board labels upcoming chores. Non-recurring chores have no schedule, so
  // they never land on the calendar.
  const chores: { id: string; title: string; color: string | null; who: string | null; day: number }[] = []
  for (const c of choresRes.results) {
    const r = parseRecur(c.recur_json)
    if (!r) continue
    const anchor = c.recur_start ?? c.created_at
    const who = whoseTurn(c.rotation_json, c.current_idx)
    for (const at of expandRange(anchor, r, from, to)) {
      chores.push({ id: `${c.id}#${at}`, title: c.title, color: c.color, who, day: dayOf(at) })
    }
  }

  return ok({ events, meals, chores, dayNotes })
})
