import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays } from '../_lib/ids'
import { parseRecur, occurrenceOn } from '../_lib/recur'
import { householdCars } from '../_lib/carPrefs'
import { carBusySpansForDay, membersOutAt, parseScheduleBlockRow, type ScheduleBlock, type ScheduleBlockRow, type CarDayOverride } from '../_lib/carResolve'
import { carStatusAt, rideConflicts, rideSpans, type CarSpan, type Ride } from '../_lib/carAvail'

// « L'auto » read model — the resolved car picture, shared by the board glance card
// (today) and the /voiture week view (a date range). One read so both surfaces see
// the same resolved state: the car's busy spans (from the schedule_blocks template +
// car_day overrides), the day's rides (events that take the car or carry passengers,
// one-off AND recurring), and the conflicts between them. ZERO AI, pure D1 + the
// pure carResolve/carAvail libs.
//
//   GET /api/car                      -> today only (board card)
//   GET /api/car?from=<day>&to=<day>  -> [from, to) local-midnight days (/voiture week)

interface RideRow {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
  contact_id: string | null
  contact_name: string | null
  business_id: string | null
  business_name: string | null
  car_id: string | null
  passengers: string | null
  recur_json: string | null
}

interface RideOut {
  id: string
  title: string
  at: number
  allDay: number
  carId: string | null
  passengers: string[]
  memberId: string | null
  contactId: string | null
  contactName: string | null
  businessId: string | null
  businessName: string | null
  conflict: boolean
}

interface DayOut {
  day: number
  spans: CarSpan[]
  rides: RideOut[]
  override: CarDayOverride | null // the per-date override in effect (so the editor can prefill + badge "Ajusté")
}

const parsePassengers = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// A ride is an event that touches the car: it takes a car OR names passengers.
const isRide = (r: { car_id: string | null; passengers: string | null }) =>
  r.car_id != null || (r.passengers != null && r.passengers !== '[]' && r.passengers !== '')

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const url = new URL(ctx.request.url)
  const today = localDayStart(new Date(Date.now()))
  // A MISSING param must fall back to today's window — NOT parse as 0. `Number(null)`
  // (an absent searchParam) is 0, which `Number.isFinite` accepts, so the old
  // `Number(get(...))` silently yielded from=to=0 → an empty day loop → no `todayDay`
  // → status fell back to "Libre toute la journée" on the board glance (which calls
  // /api/car with no params) even while the car was at work. Treat null/empty as absent.
  const numParam = (key: string, fallback: number): number => {
    const raw = url.searchParams.get(key)
    const n = raw == null || raw === '' ? NaN : Number(raw)
    return Number.isFinite(n) ? n : fallback
  }
  const from = numParam('from', today)
  const to = numParam('to', addLocalDays(today, 1))

  const cars = (await householdCars(ctx.env, hh)) ?? []
  // v1: the schedule commits THE car; focus the resolved spans on the primary car.
  // car_day overrides are matched to it. (Multi-car availability is a later pass.)
  const primaryCarId = cars[0]?.id ?? 'car'

  const [blocksRes, overridesRes, ridesRes] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, holds_car, colour AS color, recur_json, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<ScheduleBlockRow>(),
    ctx.env.DB.prepare(
      'SELECT car_id, day, free, holder_id, start_min, end_min, label FROM car_day WHERE household_id = ? AND day >= ? AND day < ?',
    )
      .bind(hh, from, to)
      .all<{
        car_id: string
        day: number
        free: number
        holder_id: string | null
        start_min: number | null
        end_min: number | null
        label: string | null
      }>(),
    // Every ride (one-off + recurring). One-offs are filtered to the window below;
    // recurring series are expanded per day. Joins the carpool driver's name.
    ctx.env.DB.prepare(
      `SELECT id, title, start_at, all_day, member_id, contact_id, business_id, car_id, passengers, recur_json,
              (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name,
              (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name
         FROM events
        WHERE household_id = ? AND (car_id IS NOT NULL OR (passengers IS NOT NULL AND passengers != '[]'))`,
    )
      .bind(hh)
      .all<RideRow>(),
  ])

  const blocks: ScheduleBlock[] = blocksRes.results.map(parseScheduleBlockRow)

  const overrides: CarDayOverride[] = overridesRes.results.map((r) => ({
    carId: r.car_id,
    day: r.day,
    free: r.free === 1,
    holderId: r.holder_id,
    startMin: r.start_min,
    endMin: r.end_min,
    label: r.label,
  }))
  const overrideFor = (day: number) => overrides.find((o) => o.day === day && o.carId === primaryCarId) ?? null

  const rideRows = ridesRes.results.filter(isRide)

  // The concrete ride instances that fall on a given local day (one-off match +
  // recurring occurrence). Returns each with its computed start instant.
  const ridesOnDay = (dayStart: number, nextDay: number): { row: RideRow; at: number }[] => {
    const out: { row: RideRow; at: number }[] = []
    for (const row of rideRows) {
      if (!row.recur_json) {
        if (row.start_at >= dayStart && row.start_at < nextDay) out.push({ row, at: row.start_at })
      } else {
        const rule = parseRecur(row.recur_json)
        if (!rule) continue
        const at = occurrenceOn(dayStart, row.start_at, rule)
        if (at != null && at >= dayStart && at < nextDay) out.push({ row, at })
      }
    }
    return out
  }

  const days: DayOut[] = []
  for (let day = from; day < to; day = addLocalDays(day, 1)) {
    const nextDay = addLocalDays(day, 1)
    const spans = carBusySpansForDay(day, blocks, overrideFor(day))
    const dayRides = ridesOnDay(day, nextDay)
    const rideModels: Ride[] = dayRides.map(({ row, at }) => ({ id: row.id, at, carId: row.car_id }))
    const conflictIds = new Set(rideConflicts(spans, rideModels).map((c) => c.ride.id))
    const rides: RideOut[] = dayRides
      .map(({ row, at }) => ({
        id: row.id,
        title: row.title,
        at,
        allDay: row.all_day,
        carId: row.car_id,
        passengers: parsePassengers(row.passengers),
        memberId: row.member_id,
        contactId: row.contact_id,
        contactName: row.contact_name,
        businessId: row.business_id,
        businessName: row.business_name,
        conflict: conflictIds.has(row.id),
      }))
      .sort((a, b) => a.allDay - b.allDay || a.at - b.at)
    days.push({ day, spans, rides, override: overrideFor(day) })
  }

  // "Now" block — only meaningful for today; the board card reads it. status = is
  // the car free right now / until when; membersOut = who's away (who's-home derive).
  const now = Math.floor(Date.now() / 1000)
  const todayInRange = today >= from && today < to
  const todayDay = days.find((d) => d.day === today)
  const dayEnd = addLocalDays(today, 1)
  // Fold today's car-taking rides into the STATUS (not the returned spans, which stay
  // the real schedule windows for /voiture + conflicts) so the glance answers "où est
  // l'auto" truthfully: a ride in progress reads "Avec Camille · revient ~17 h", an
  // upcoming one "Libre jusqu'à 14 h", a past one "le reste de la journée" — never
  // "Libre toute la journée" while the car is out. Driver + all-day ride along.
  const todayRides: Ride[] = todayDay
    ? todayDay.rides.map((r) => ({ id: r.id, at: r.at, carId: r.carId, holderId: r.memberId, allDay: r.allDay === 1 }))
    : []
  const statusSpans = todayDay ? [...todayDay.spans, ...rideSpans(todayRides, today, dayEnd)] : []
  const status = todayDay ? carStatusAt(statusSpans, now, dayEnd) : { free: true as const }
  const membersOut = todayInRange ? membersOutAt(today, blocks, now) : []

  return ok({
    cars,
    hasSchedule: blocks.length > 0,
    now,
    today,
    status,
    membersOut,
    days,
  })
})
