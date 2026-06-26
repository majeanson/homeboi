import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart } from '../_lib/ids'
import { parseRecur, expandRange, rotationOffset } from '../_lib/recur'
import { fetchBirthdayPeople, birthdayOccurrences } from '../_lib/birthdays'
import { workOccurrencesInRange, type ScheduleBlock } from '../_lib/carResolve'

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
    return ok({ events: [], meals: [], chores: [], dayNotes: [], todos: [], homeProjects: [] })
  }
  to = Math.min(to, from + MAX_DAYS * DAY)

  const [members, oneOff, recurring, mealsRes, dayNotesRes, choresRes, todosRes, birthdayPeople, scheduleRes, homeRes] = await Promise.all([
    ctx.env.DB.prepare('SELECT id, display_name FROM members WHERE household_id = ?')
      .bind(hh)
      .all<{ id: string; display_name: string }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id, contact_id, business_id, bring_template_id, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ?',
    )
      .bind(hh, from, to)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; contact_id: string | null; contact_name: string | null; business_id: string | null; business_name: string | null; business_colour: string | null; bring_template_id: string | null }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id, contact_id, business_id, recur_json, bring_template_id, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; contact_id: string | null; contact_name: string | null; business_id: string | null; business_name: string | null; business_colour: string | null; recur_json: string; bring_template_id: string | null }>(),
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
      'SELECT id, title, colour AS color, rotation_json, current_idx, last_done_at, recur_json, recur_start, created_at FROM tasks WHERE household_id = ?',
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
    // Automatic birthdays — derived from members + contacts, never stored as events.
    fetchBirthdayPeople(ctx.env.DB, hh),
    // « L'auto » work-schedule blocks (#28) — derived onto each matching day across
    // the window (never event rows). A calendar is where the full recurring rota
    // belongs, so unlike the board these span the whole [from, to).
    ctx.env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, weekdays, holds_car, colour AS color, week_interval, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<{ id: string; member_id: string; label: string | null; start_min: number; end_min: number; weekdays: string; holds_car: number; color: string | null; week_interval: number; anchor_day: number | null }>(),
    // "Projets & Entretien" (home_projects, #home-projects) — DATED rows only;
    // recurring expand across the window, one-off land on their day. Like chores,
    // they ride the same calendar. Undated rows (at IS NULL) have no cell.
    ctx.env.DB.prepare(
      'SELECT id, kind, title, colour AS color, at, recur_json FROM home_projects WHERE household_id = ? AND at IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; kind: string; title: string; color: string | null; at: number; recur_json: string | null }>(),
  ])

  const inRange = (day: number) => day >= from && day < to

  const events: {
    id: string
    title: string
    at: number
    all_day: number
    member_id: string | null
    contact_id?: string | null
    contact_name?: string | null
    business_id?: string | null
    business_name?: string | null
    business_colour?: string | null
    day: number
    birthday?: boolean
    age?: number | null
    work?: boolean // a derived « L'auto » work-schedule window (read-only → /voiture)
    end?: number // work windows carry an end instant (a span, not a point)
    color?: string | null // the block's tint (member colour falls back client-side)
    holds_car?: number // 1 = this window ties up the shared car
    bring_template_id?: string | null // « Activité »: its "what to bring" template (Avant de partir surfaces it)
  }[] = []
  for (const e of oneOff.results) {
    const day = dayOf(e.start_at)
    if (inRange(day))
      events.push({
        id: e.id,
        title: e.title,
        at: e.start_at,
        all_day: e.all_day,
        member_id: e.member_id,
        contact_id: e.contact_id,
        contact_name: e.contact_name,
        business_id: e.business_id,
        business_name: e.business_name,
        business_colour: e.business_colour,
        bring_template_id: e.bring_template_id,
        day,
      })
  }
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, from, to)) {
      events.push({
        id: `${e.id}#${at}`,
        title: e.title,
        at,
        all_day: e.all_day,
        member_id: e.member_id,
        contact_id: e.contact_id,
        contact_name: e.contact_name,
        business_id: e.business_id,
        business_name: e.business_name,
        business_colour: e.business_colour,
        bring_template_id: e.bring_template_id,
        day: dayOf(at),
      })
    }
  }
  // Derived birthdays — all-day, read-only (the client renders a cake + routes the
  // tap to the person, not an event editor).
  for (const o of birthdayOccurrences(birthdayPeople, from, to)) {
    events.push({ id: o.id, title: o.name, at: o.at, all_day: 1, member_id: o.memberId, day: dayOf(o.at), birthday: true, age: o.age })
  }

  // Derived « L'auto » work windows — read-only (the client renders a clock + routes
  // the tap to /voiture, not an event editor). A span, so `end` rides along.
  const scheduleBlocks: ScheduleBlock[] = (scheduleRes.results).map((r) => {
    let weekdays: number[] = []
    try {
      const v = JSON.parse(r.weekdays)
      if (Array.isArray(v)) weekdays = v.filter((n): n is number => Number.isInteger(n))
    } catch {
      weekdays = []
    }
    return { id: r.id, memberId: r.member_id, label: r.label, startMin: r.start_min, endMin: r.end_min, weekdays, holdsCar: r.holds_car === 1, color: r.color, weekInterval: r.week_interval ?? 1, anchorDay: r.anchor_day ?? null }
  })
  for (const o of workOccurrencesInRange(scheduleBlocks, from, to)) {
    events.push({ id: o.id, title: o.label ?? '', at: o.at, end: o.endAt, all_day: 0, member_id: o.memberId, day: dayOf(o.at), work: true, color: o.color, holds_car: o.holdsCar ? 1 : 0 })
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

  // "Projets & Entretien" expanded across the window: recurring via the shared
  // expander (anchored on `at`), one-off bucketed on their day. `kind` rides along
  // so the client can tint/label projet vs entretien.
  const homeProjects: { id: string; kind: string; title: string; color: string | null; day: number }[] = []
  for (const h of homeRes.results) {
    const r = parseRecur(h.recur_json)
    if (r) {
      for (const at of expandRange(h.at, r, from, to)) {
        homeProjects.push({ id: `${h.id}#${at}`, kind: h.kind, title: h.title, color: h.color, day: dayOf(at) })
      }
    } else {
      const day = dayOf(h.at)
      if (inRange(day)) homeProjects.push({ id: h.id, kind: h.kind, title: h.title, color: h.color, day })
    }
  }

  return ok({ events, meals, chores, dayNotes, todos, homeProjects })
})
