import { addLocalDays } from './ids'
import { parseRecur, occurrenceOn } from './recur'
import { householdCars, type Car } from './carPrefs'
import { carBusySpansForDay, parseScheduleBlockRow, type ScheduleBlock, type ScheduleBlockRow, type CarDayOverride } from './carResolve'
import { mergeSpans, rideConflicts, rideSpans, type CarSpan, type Ride } from './carAvail'
import type { Env } from './env'

// « Les engagements » — the ONE place that answers "what occupies the shared car, and
// when". A rendez-vous that takes the car, a recurring work window, and a per-date
// adjustment are three faces of one question, and this resolves them together.
//
// It exists because that resolution used to live INSIDE /api/car, so any other
// endpoint wanting the same answer had to re-derive it from the same three tables —
// and the ones that didn't bother simply gave a different answer. « À régler » never
// saw a car clash even though /api/car had already computed it.
//
// Composition only: interval math stays in _lib/carAvail, template + override
// resolution in _lib/carResolve, recurrence in _lib/recur. Nothing here
// re-implements them. Deliberately NOT a route — /api/board must be able to read it
// without importing a car endpoint.

// One row of `events` that takes the car. `car_id IS NOT NULL` is the WHOLE test: it
// is exactly what the « Prend l'auto » checkbox writes. (`passengers` is « Qui », the
// people a rendez-vous concerns — it carries no car meaning. Treating it as one is
// what made every ordinary rendez-vous show up in « L'auto » while producing no busy
// span, so the glance listed an outing AND said « Libre toute la journée ».)
export interface RideRow {
  id: string
  title: string
  start_at: number
  all_day: number
  end_at: number | null
  member_id: string | null
  contact_id: string | null
  contact_name: string | null
  business_id: string | null
  business_name: string | null
  car_id: string | null
  passengers: string | null
  recur_json: string | null
}

export interface OccupancyInput {
  cars: Car[]
  // The car the spans/conflicts are resolved against. v1: the schedule commits THE
  // car, so overrides and conflicts focus on the first one. Falls back to the same
  // 'car' id the client seeds when a household never configured one (lib/carPrefs).
  primaryCarId: string
  hasSchedule: boolean
  blocks: ScheduleBlock[]
  overrides: CarDayOverride[]
  rideRows: RideRow[]
}

// One local day, fully resolved.
export interface OccupancyDay {
  day: number
  /** RAW schedule/override windows — what the /voiture day editor prefills from. */
  spans: CarSpan[]
  /** RESOLVED busy: `spans` PLUS the day's car-taking rendez-vous. Ask THIS whether the car is busy. */
  carSpans: CarSpan[]
  rides: { row: RideRow; at: number; conflict: boolean }[]
  override: CarDayOverride | null
}

// The three reads an occupancy window needs, in one batch. Mirrors the shape of
// _lib/birthdays (a DB half + a pure half in one module), which board/month/a-regler
// already share — so adopting this is a two-line diff at a call site.
export async function fetchCarOccupancy(env: Env, hh: string, from: number, to: number): Promise<OccupancyInput> {
  const [blocksRes, overridesRes, ridesRes, cars] = await Promise.all([
    env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, holds_car, colour AS color, recur_json, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<ScheduleBlockRow>(),
    env.DB.prepare(
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
    // Every car-taking rendez-vous (one-off + recurring). One-offs are filtered to the
    // window per day below; recurring series are expanded there. Joins the « Avec »
    // name so a glance can say who we're going to see.
    env.DB.prepare(
      'SELECT id, title, start_at, all_day, end_at, member_id, contact_id, business_id, car_id, passengers, recur_json,' +
        ' (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name,' +
        ' (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name' +
        ' FROM events WHERE household_id = ? AND car_id IS NOT NULL',
    )
      .bind(hh)
      .all<RideRow>(),
    householdCars(env, hh),
  ])
  const resolved = cars ?? []
  return {
    cars: resolved,
    primaryCarId: resolved[0]?.id ?? 'car',
    hasSchedule: blocksRes.results.length > 0,
    blocks: blocksRes.results.map(parseScheduleBlockRow),
    overrides: overridesRes.results.map((r) => ({
      carId: r.car_id,
      day: r.day,
      free: r.free === 1,
      holderId: r.holder_id,
      startMin: r.start_min,
      endMin: r.end_min,
      label: r.label,
    })),
    rideRows: ridesRes.results,
  }
}

/** The per-date adjustment in effect for the primary car on `day`, if any. PURE. */
export function overrideFor(input: OccupancyInput, day: number): CarDayOverride | null {
  return input.overrides.find((o) => o.day === day && o.carId === input.primaryCarId) ?? null
}

/** The concrete rendez-vous instances landing on one local day (one-off match +
 *  recurring occurrence), each with its computed start instant. PURE. */
export function ridesOnDay(input: OccupancyInput, dayStart: number, nextDay: number): { row: RideRow; at: number }[] {
  const out: { row: RideRow; at: number }[] = []
  for (const row of input.rideRows) {
    // Belt and braces: fetchCarOccupancy's SQL already narrows to car-taking rows,
    // but the invariant lives HERE too so a future caller that hand-rolls the query
    // (or forgets the WHERE) cannot reintroduce the « Libre toute la journée » bug —
    // a rendez-vous with no car has no business in « L'auto » at all.
    if (row.car_id == null) continue
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

/** A car-taking rendez-vous as the interval engine's `Ride`. Only the PRIMARY car
 *  participates in availability: a rendez-vous on a second car has no schedule of its
 *  own to be measured against, and judging it by car #1's would flag a clash that
 *  isn't one. A recurring rendez-vous keeps its LENGTH on every occurrence, so the
 *  duration travels, not the stored end instant (which belongs to the first). PURE. */
export function toRide(input: OccupancyInput, row: RideRow, at: number): Ride {
  return {
    id: row.id,
    at,
    endAt: row.end_at != null && row.end_at > row.start_at ? at + (row.end_at - row.start_at) : null,
    carId: row.car_id === input.primaryCarId ? row.car_id : null,
    holderId: row.member_id,
    allDay: row.all_day === 1,
    label: row.title,
  }
}

/** One local day, fully resolved: the schedule/override windows, the car-taking
 *  rendez-vous landing on it, the merged busy set, and which rendez-vous collide with
 *  a moment the car is already spoken for. PURE. */
export function resolveCarDay(input: OccupancyInput, day: number): OccupancyDay {
  const nextDay = addLocalDays(day, 1)
  const override = overrideFor(input, day)
  const spans = carBusySpansForDay(day, input.blocks, override)
  const dayRides = ridesOnDay(input, day, nextDay)
  const rideModels = dayRides.map(({ row, at }) => toRide(input, row, at))
  const conflictIds = new Set(rideConflicts(spans, rideModels, day, nextDay).map((c) => c.ride.id))
  return {
    day,
    spans,
    carSpans: mergeSpans([...spans, ...rideSpans(rideModels, day, nextDay)]),
    rides: dayRides.map(({ row, at }) => ({ row, at, conflict: conflictIds.has(row.id) })),
    override,
  }
}

/** Every local day in [from, to), resolved. PURE. */
export function resolveCarRange(input: OccupancyInput, from: number, to: number): OccupancyDay[] {
  const days: OccupancyDay[] = []
  for (let day = from; day < to; day = addLocalDays(day, 1)) days.push(resolveCarDay(input, day))
  return days
}
