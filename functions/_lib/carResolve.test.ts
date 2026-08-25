import { describe, it, expect } from 'vitest'
import { carBusySpansForDay, membersOutAt, workOccurrencesInRange, type ScheduleBlock, type CarDayOverride } from './carResolve'
import type { Recur } from './recur'
import { localDayStart, localTimeOnDay, addLocalDays } from './ids'

// Anchor on real LOCAL midnights (a normal, non-DST June week) so the resolver's
// localTimeOnDay-based instant math lines up with the test's expectations. `atOn`
// mirrors the resolver's own conversion (delegated to the DST-safe helper), so the
// assertions exercise the filtering/mapping logic, not instant arithmetic (covered
// by ids/recur tests). Recurrence now rides _lib/recur, so a block's active weekday
// derives from the DAY passed in — the tests use the genuine Wed/Thu/Sun/Mon dates.
const WED = localDayStart(new Date(Date.UTC(2026, 5, 3, 12))) // Wed 2026-06-03, local midnight
const THU = addLocalDays(WED, 1)
const SUN = addLocalDays(WED, 4) // Sun 2026-06-07
const MON = addLocalDays(WED, 5) // Mon 2026-06-08
const min = (h: number, m = 0) => h * 60 + m
const atOn = (day: number, h: number, m = 0) => localTimeOnDay(day, (h * 60 + m) * 60)
// A weekly recurrence rule (the only freq a schedule block uses).
const wk = (weekdays: number[], interval?: number): Recur => (interval ? { freq: 'weekly', interval, weekdays } : { freq: 'weekly', weekdays })

// Marc works Mon–Fri 8–17 and takes the car; Julie has Tue/Thu 9–15 but on the bus
// (presence only, car stays home). anchorAt 0 = every-week (phase irrelevant).
const MARC: ScheduleBlock = { id: 'b1', memberId: 'marc', label: 'Travail', startMin: min(8), endMin: min(17), holdsCar: true, recur: wk([1, 2, 3, 4, 5]), anchorAt: 0 }
const JULIE: ScheduleBlock = { id: 'b2', memberId: 'julie', label: 'Travail', startMin: min(9), endMin: min(15), holdsCar: false, recur: wk([2, 4]), anchorAt: 0 }
const BLOCKS = [MARC, JULIE]

describe('carBusySpansForDay — template', () => {
  it('busies the car on a weekday Marc works (holds_car)', () => {
    const spans = carBusySpansForDay(WED, BLOCKS)
    expect(spans).toEqual([{ start: atOn(WED, 8), end: atOn(WED, 17), label: 'Travail', holderId: 'marc' }])
  })

  it('ignores a non-car block (Julie on the bus) — car stays home', () => {
    // Thursday: Marc (car) 8–17 + Julie (no car) 9–15 → only Marc's span.
    const spans = carBusySpansForDay(THU, BLOCKS)
    expect(spans).toEqual([{ start: atOn(THU, 8), end: atOn(THU, 17), label: 'Travail', holderId: 'marc' }])
  })

  it('is free on a weekend (no blocks match)', () => {
    expect(carBusySpansForDay(SUN, BLOCKS)).toEqual([])
  })

  it('drops an inverted block defensively', () => {
    const bad: ScheduleBlock = { id: 'x', memberId: 'm', startMin: min(17), endMin: min(8), holdsCar: true, recur: wk([1]), anchorAt: 0 }
    expect(carBusySpansForDay(MON, [bad])).toEqual([])
  })

  it('a block with no weekday never fires', () => {
    const none: ScheduleBlock = { id: 'n', memberId: 'm', startMin: min(8), endMin: min(17), holdsCar: true, recur: wk([]), anchorAt: 0 }
    expect(carBusySpansForDay(WED, [none])).toEqual([])
  })
})

describe('carBusySpansForDay — per-date override', () => {
  it('a "free" override clears the template (car stays home that day)', () => {
    const ov: CarDayOverride = { carId: 'car', day: WED, free: true }
    expect(carBusySpansForDay(WED, BLOCKS, ov)).toEqual([])
  })

  it('a windowed override REPLACES the template for that day', () => {
    const ov: CarDayOverride = { carId: 'car', day: WED, free: false, holderId: 'julie', startMin: min(10), endMin: min(12), label: 'Julie — rendez-vous' }
    expect(carBusySpansForDay(WED, BLOCKS, ov)).toEqual([
      { start: atOn(WED, 10), end: atOn(WED, 12), label: 'Julie — rendez-vous', holderId: 'julie' },
    ])
  })

  it('a non-free override with no usable window = car free that day', () => {
    const ov: CarDayOverride = { carId: 'car', day: WED, free: false }
    expect(carBusySpansForDay(WED, BLOCKS, ov)).toEqual([])
  })
})

describe('carBusySpansForDay — every-N-weeks recurrence (#28)', () => {
  // Marc works the car every OTHER Wednesday, phased from WED's week (week 0 = "on").
  const BIWEEKLY: ScheduleBlock = { id: 'bi', memberId: 'marc', startMin: min(8), endMin: min(17), holdsCar: true, recur: wk([3], 2), anchorAt: WED }

  it('is busy on the anchor week (an "on" week)', () => {
    expect(carBusySpansForDay(WED, [BIWEEKLY])).toEqual([{ start: atOn(WED, 8), end: atOn(WED, 17), label: undefined, holderId: 'marc' }])
  })
  it('is free the following week (an "off" week)', () => {
    expect(carBusySpansForDay(addLocalDays(WED, 7), [BIWEEKLY])).toEqual([])
  })
  it('is busy again two weeks on', () => {
    expect(carBusySpansForDay(addLocalDays(WED, 14), [BIWEEKLY]).length).toBe(1)
  })
  it('interval 1 (every week) behaves as every week regardless of anchor', () => {
    const weekly: ScheduleBlock = { ...BIWEEKLY, recur: wk([3], 1), anchorAt: 0 }
    expect(carBusySpansForDay(addLocalDays(WED, 7), [weekly]).length).toBe(1)
  })
})

describe('workOccurrencesInRange — derived schedule (calendar/agenda)', () => {
  it('emits one window per matching weekday in the range', () => {
    // A single Wednesday window → exactly Marc's (Julie is Tue/Thu, so none today).
    const occs = workOccurrencesInRange(BLOCKS, WED, addLocalDays(WED, 1))
    expect(occs).toEqual([
      { id: `work:b1:${WED}`, blockId: 'b1', memberId: 'marc', label: 'Travail', at: atOn(WED, 8), endAt: atOn(WED, 17), holdsCar: true, color: null },
    ])
  })
  it('includes non-car (presence-only) blocks too — they surface on the calendar', () => {
    // Thursday: Marc (car) + Julie (bus) both have a window.
    const occs = workOccurrencesInRange(BLOCKS, THU, addLocalDays(THU, 1))
    expect(occs.map((o) => o.memberId).sort()).toEqual(['julie', 'marc'])
    expect(occs.find((o) => o.memberId === 'julie')?.holdsCar).toBe(false)
  })
  it('respects every-N-weeks (off weeks produce no window)', () => {
    const bi: ScheduleBlock = { id: 'bi', memberId: 'marc', startMin: min(8), endMin: min(17), holdsCar: true, recur: wk([3], 2), anchorAt: WED }
    const offWed = addLocalDays(WED, 7)
    expect(workOccurrencesInRange([bi], offWed, addLocalDays(offWed, 1))).toEqual([])
  })
})

describe('membersOutAt — derived presence', () => {
  it('lists everyone out at a given instant (car-holding or not)', () => {
    // Thursday 10:00 — both Marc (8–17) and Julie (9–15) are out.
    expect(membersOutAt(THU, BLOCKS, atOn(THU, 10)).sort()).toEqual(['julie', 'marc'])
  })
  it('nobody out before the first block', () => {
    expect(membersOutAt(THU, BLOCKS, atOn(THU, 7))).toEqual([])
  })
  it('only Marc out at 16:00 (Julie already home)', () => {
    expect(membersOutAt(THU, BLOCKS, atOn(THU, 16))).toEqual(['marc'])
  })
})

// A per-date car adjustment must not make one date read three different ways across
// /voiture, the board and the calendar (the one-engagement pass).
describe('membersOutAt — with a per-date car adjustment', () => {
  it('adds the adjustment’s holder for its window, on top of the template', () => {
    // Sunday: nobody's template block runs, but the car was lent to Julie 13–16.
    const ov: CarDayOverride = { carId: 'car', day: SUN, free: false, holderId: 'julie', startMin: min(13), endMin: min(16), label: null }
    expect(membersOutAt(SUN, BLOCKS, atOn(SUN, 14), ov)).toEqual(['julie'])
    expect(membersOutAt(SUN, BLOCKS, atOn(SUN, 12), ov)).toEqual([])
  })

  it('leaves presence alone when the car simply stays home', () => {
    // « Reste à la maison » is a statement about the CAR, not about the people —
    // Marc still worked Wednesday, he just didn't drive.
    const ov: CarDayOverride = { carId: 'car', day: WED, free: true, holderId: null, startMin: null, endMin: null, label: null }
    expect(membersOutAt(WED, BLOCKS, atOn(WED, 10), ov)).toEqual(['marc'])
  })

  it('never double-counts a holder who is already out on the template', () => {
    const ov: CarDayOverride = { carId: 'car', day: WED, free: false, holderId: 'marc', startMin: min(9), endMin: min(12), label: null }
    expect(membersOutAt(WED, BLOCKS, atOn(WED, 10), ov)).toEqual(['marc'])
  })
})

describe('workOccurrencesInRange — an adjusted day releases the car', () => {
  it('keeps the work window but drops holdsCar on an overridden date', () => {
    const occs = workOccurrencesInRange(BLOCKS, WED, addLocalDays(WED, 1), [{ day: WED }])
    const marc = occs.find((o) => o.memberId === 'marc')
    // Still at work — the window is untouched…
    expect(marc?.at).toBe(atOn(WED, 8))
    expect(marc?.endAt).toBe(atOn(WED, 17))
    // …but the car is no longer his that day, so the calendar must not draw it.
    expect(marc?.holdsCar).toBe(false)
  })

  it('leaves other dates alone', () => {
    const occs = workOccurrencesInRange(BLOCKS, WED, addLocalDays(WED, 2), [{ day: WED }])
    expect(occs.find((o) => o.memberId === 'marc' && o.at === atOn(THU, 8))?.holdsCar).toBe(true)
  })

  it('is unchanged when no adjustments are passed (every existing caller)', () => {
    expect(workOccurrencesInRange(BLOCKS, WED, addLocalDays(WED, 1))).toEqual(
      workOccurrencesInRange(BLOCKS, WED, addLocalDays(WED, 1), []),
    )
  })
})
