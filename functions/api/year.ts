import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart } from '../_lib/ids'
import { parseRecur, expandRange } from '../_lib/recur'
import { fetchBirthdayPeople, birthdayOccurrences } from '../_lib/birthdays'
import { fetchCarnetLifeItems, replacementAt } from '../_lib/carnetLife'

// « L'année » (A-1, bmad/09) — the year's FIXED POINTS for the board's third
// glance: derived birthdays, yearly-recurring events, upkeep/project cadences
// (home_projects occurrences), trips, and each cared-for thing's projected
// replacement day (« le long jeu »). Deliberately NOT the month read:
// /api/month carries everything dated (meals, chores, work hours) and caps at
// 45 days; the year view is a HORIZON, so it reads only what lives on the
// year's scale, over a ~12-month window, cold-path (fetched when the view
// opens, never polled — D-18). The QC/CA fêtes are NOT here: they derive
// client-side in lib/year (they need zero household data). ZERO AI: a pure D1
// read, same family as /api/month (NFR-PERF-1).
const DAY = 86400
const MAX_DAYS = 400 // 12 months + slack; caps the expansion cost regardless.

const dayOf = (at: number) => localDayStart(new Date(at * 1000))

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const url = new URL(ctx.request.url)
  const from = Math.floor(Number(url.searchParams.get('from')))
  let to = Math.floor(Number(url.searchParams.get('to')))
  // Bad/missing window → an empty horizon rather than a 400 (the month read's rule).
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from) {
    return ok({ birthdays: [], events: [], upkeep: [], life: [], trips: [] })
  }
  to = Math.min(to, from + MAX_DAYS * DAY)

  const [birthdayPeople, recurring, homeRes, lifeItems, tripsRes, sharedTripsRes] = await Promise.all([
    // Automatic birthdays — derived from members + contacts, never event rows.
    fetchBirthdayPeople(ctx.env.DB, hh),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; recur_json: string }>(),
    ctx.env.DB.prepare(
      'SELECT id, kind, title, colour AS color, at, recur_json FROM home_projects WHERE household_id = ? AND at IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; kind: string; title: string; color: string | null; at: number; recur_json: string | null }>(),
    // « Le long jeu » — things with an install date + service life (carnetLife).
    fetchCarnetLifeItems(ctx.env.DB, hh),
    // Trips overlapping the window — household + shared, the /api/month pair.
    ctx.env.DB.prepare(
      'SELECT id, title, colour, start_at, end_at FROM trips WHERE household_id = ? AND deleted_at IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL AND start_at < ? AND end_at >= ?',
    )
      .bind(hh, to, from)
      .all<{ id: string; title: string; colour: string; start_at: number; end_at: number }>(),
    ctx.env.DB.prepare(
      'SELECT st.id, st.title, st.colour, st.start_at, st.end_at FROM shared_trips st JOIN shared_trip_members m ON m.shared_trip_id = st.id AND m.household_id = ? AND m.revoked_at IS NULL WHERE st.deleted_at IS NULL AND st.start_at IS NOT NULL AND st.end_at IS NOT NULL AND st.start_at < ? AND st.end_at >= ?',
    )
      .bind(hh, to, from)
      .all<{ id: string; title: string; colour: string; start_at: number; end_at: number }>(),
  ])

  const birthdays = birthdayOccurrences(birthdayPeople, from, to).map((o) => ({
    id: o.id,
    name: o.name,
    day: dayOf(o.at),
    age: o.age,
    memberId: o.memberId,
  }))

  // YEARLY-recurring events only — a weekly practice is a week rhythm, not a
  // year fixed point; it would repaint every cell of the horizon.
  const events: { id: string; title: string; day: number }[] = []
  for (const e of recurring.results) {
    const r = parseRecur(e.recur_json)
    if (!r || r.freq !== 'yearly') continue
    for (const at of expandRange(e.start_at, r, from, to)) {
      events.push({ id: `${e.id}#${at}`, title: e.title, day: dayOf(at) })
    }
  }

  // Upkeep/project cadences — every occurrence in the window (recurring rows
  // expanded, one-offs on their day), the same expansion /api/month does.
  const upkeep: { id: string; kind: string; title: string; color: string | null; day: number }[] = []
  for (const h of homeRes.results) {
    const r = parseRecur(h.recur_json)
    if (r) {
      for (const at of expandRange(h.at, r, from, to)) {
        upkeep.push({ id: `${h.id}#${at}`, kind: h.kind, title: h.title, color: h.color, day: dayOf(at) })
      }
    } else {
      const day = dayOf(h.at)
      if (day >= from && day < to) upkeep.push({ id: h.id, kind: h.kind, title: h.title, color: h.color, day })
    }
  }

  // Each thing's projected replacement day inside the window. NOT lead-filtered
  // like the board's « soon » glance (carnetLifeSoon) — a horizon shows the
  // whole year, calmly, as a single day marker per thing.
  const life = lifeItems
    .map((it) => ({ carnetId: it.carnetId, name: it.name, color: it.color, day: replacementAt(it.installedAt, it.lifespanMonths) }))
    .filter((x) => x.day >= from && x.day < to)

  const trips: { id: string; title: string; colour: string; start_at: number; end_at: number; shared?: true }[] =
    tripsRes.results.map((tr) => ({ id: tr.id, title: tr.title, colour: tr.colour, start_at: tr.start_at, end_at: tr.end_at }))
  for (const tr of sharedTripsRes.results) {
    trips.push({ id: tr.id, title: tr.title, colour: tr.colour, start_at: tr.start_at, end_at: tr.end_at, shared: true })
  }

  return ok({ birthdays, events, upkeep, life, trips })
})
