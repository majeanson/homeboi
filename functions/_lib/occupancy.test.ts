import { describe, it, expect } from 'vitest'
import { resolveCarDay, resolveCarRange, ridesOnDay, toRide, overrideFor, type OccupancyInput, type RideRow } from './occupancy'
import { localDayStart, localTimeOnDay, addLocalDays } from './ids'
import type { ScheduleBlock } from './carResolve'
import type { Recur } from './recur'

// Real LOCAL midnights (a normal, non-DST June week), like carResolve.test.ts — the
// resolver's instant math is DST-safe and these assertions exercise the composition,
// not the arithmetic.
const WED = localDayStart(new Date(Date.UTC(2026, 5, 3, 12))) // Wed 2026-06-03
const THU = addLocalDays(WED, 1)
const SUN = addLocalDays(WED, 4)
const min = (h: number) => h * 60
const atOn = (day: number, h: number) => localTimeOnDay(day, h * 3600)
const wk = (weekdays: number[]): Recur => ({ freq: 'weekly', weekdays })

// Marc works Mon–Fri 8–17 and takes the car.
const MARC: ScheduleBlock = {
  id: 'b1',
  memberId: 'marc',
  label: 'Travail',
  startMin: min(8),
  endMin: min(17),
  holdsCar: true,
  recur: wk([1, 2, 3, 4, 5]),
  anchorAt: 0,
}

const ride = (over: Partial<RideRow> = {}): RideRow => ({
  id: 'e1',
  title: 'Épicerie',
  start_at: atOn(WED, 18),
  all_day: 0,
  end_at: null,
  member_id: 'julie',
  contact_id: null,
  contact_name: null,
  business_id: null,
  business_name: null,
  car_id: 'car1',
  passengers: null,
  recur_json: null,
  ...over,
})

const input = (over: Partial<OccupancyInput> = {}): OccupancyInput => ({
  cars: [{ id: 'car1', name: 'La familiale' }],
  primaryCarId: 'car1',
  hasSchedule: true,
  blocks: [MARC],
  overrides: [],
  rideRows: [],
  ...over,
})

describe('resolveCarDay — the resolved busy answer', () => {
  it('a day with only a work window is busy for that window', () => {
    const d = resolveCarDay(input(), WED)
    expect(d.carSpans).toEqual([{ start: atOn(WED, 8), end: atOn(WED, 17), label: 'Travail', holderId: 'marc' }])
  })

  // THE reported bug, pinned at the resolver. A rendez-vous with people named but no
  // car must not occupy « L'auto » — `passengers` is « Qui », not "who is riding".
  it('a rendez-vous that names people but takes NO car occupies nothing', () => {
    // Sunday: no work block runs, so the only thing that could make it busy is the
    // rendez-vous — and it must not, because it doesn't take the car.
    const d = resolveCarDay(input({ rideRows: [ride({ car_id: null, passengers: '["m1","m2"]', start_at: atOn(SUN, 14) })] }), SUN)
    expect(d.carSpans).toEqual([])
    expect(d.rides.map((r) => r.row.id)).toEqual([])
  })

  it('a rendez-vous that DOES take the car makes an otherwise-free day busy', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ start_at: atOn(SUN, 14) })] }), SUN)
    expect(d.spans).toEqual([]) // no schedule window…
    expect(d.carSpans).toHaveLength(1) // …but the car is spoken for
    expect(d.carSpans[0].start).toBe(atOn(SUN, 14))
    expect(d.carSpans[0].end).toBe(atOn(SUN, 16)) // the 2 h default
  })

  it('an explicit « Jusqu’à » sets the exact window instead of the default', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ start_at: atOn(SUN, 14), end_at: atOn(SUN, 15) })] }), SUN)
    expect(d.carSpans[0].end).toBe(atOn(SUN, 15))
  })

  it('merges the work window and a rendez-vous that runs straight out of it', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ start_at: atOn(WED, 17) })] }), WED)
    expect(d.carSpans).toHaveLength(1)
    expect(d.carSpans[0].start).toBe(atOn(WED, 8))
    expect(d.carSpans[0].end).toBe(atOn(WED, 19))
  })
})

describe('resolveCarDay — conflicts', () => {
  it('flags a rendez-vous landing while the car is at work', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ start_at: atOn(WED, 16) })] }), WED)
    expect(d.rides[0].conflict).toBe(true)
  })

  it('does not flag one that starts exactly when the car is back', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ start_at: atOn(WED, 17) })] }), WED)
    expect(d.rides[0].conflict).toBe(false)
  })

  it('flags one that begins in a free gap but runs INTO the work window', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ start_at: atOn(WED, 7) })] }), WED)
    expect(d.rides[0].conflict).toBe(true)
  })

  it('a rendez-vous on a SECOND car is not judged against the primary car’s schedule', () => {
    const d = resolveCarDay(input({ rideRows: [ride({ car_id: 'car2', start_at: atOn(WED, 16) })] }), WED)
    // It still shows in the day's list…
    expect(d.rides).toHaveLength(1)
    // …but it neither occupies the primary car nor clashes with its schedule.
    expect(d.rides[0].conflict).toBe(false)
    expect(d.carSpans).toEqual([{ start: atOn(WED, 8), end: atOn(WED, 17), label: 'Travail', holderId: 'marc' }])
  })
})

describe('resolveCarDay — per-date adjustments', () => {
  const OV = { carId: 'car1', day: WED, free: true, holderId: null, startMin: null, endMin: null, label: null }

  it('« reste à la maison » clears the template’s claim', () => {
    expect(resolveCarDay(input({ overrides: [OV] }), WED).carSpans).toEqual([])
  })

  it('an adjustment for a DIFFERENT car is ignored', () => {
    const d = resolveCarDay(input({ overrides: [{ ...OV, carId: 'car2' }] }), WED)
    expect(d.carSpans).toHaveLength(1)
    expect(overrideFor(input({ overrides: [{ ...OV, carId: 'car2' }] }), WED)).toBeNull()
  })

  it('a rendez-vous still occupies the car on a day the schedule released it', () => {
    const d = resolveCarDay(input({ overrides: [OV], rideRows: [ride({ start_at: atOn(WED, 14) })] }), WED)
    expect(d.carSpans).toHaveLength(1)
    expect(d.carSpans[0].start).toBe(atOn(WED, 14))
  })
})

describe('ridesOnDay / toRide — recurrence', () => {
  it('expands a recurring rendez-vous onto each matching date', () => {
    const rec = ride({ start_at: atOn(WED, 18), recur_json: JSON.stringify(wk([4])) }) // Thursdays
    const inp = input({ rideRows: [rec] })
    expect(ridesOnDay(inp, WED, THU)).toEqual([])
    expect(ridesOnDay(inp, THU, addLocalDays(THU, 1))).toHaveLength(1)
  })

  it('a recurring rendez-vous keeps its LENGTH, not the anchor’s end instant', () => {
    // Anchored Wednesday 18–20 h, recurring Thursdays: the Thursday occurrence must
    // last two hours on THURSDAY, not carry Wednesday's absolute end.
    const rec = ride({ start_at: atOn(WED, 18), end_at: atOn(WED, 20), recur_json: JSON.stringify(wk([4])) })
    const inp = input({ rideRows: [rec] })
    const [occ] = ridesOnDay(inp, THU, addLocalDays(THU, 1))
    const r = toRide(inp, occ.row, occ.at)
    expect(r.at).toBe(atOn(THU, 18))
    expect(r.endAt).toBe(atOn(THU, 20))
  })
})

describe('resolveCarRange', () => {
  it('resolves one entry per local day in the window', () => {
    const days = resolveCarRange(input(), WED, addLocalDays(WED, 3))
    expect(days.map((d) => d.day)).toEqual([WED, THU, addLocalDays(WED, 2)])
  })
})
