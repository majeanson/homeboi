import { describe, it, expect } from 'vitest'
import { carBusySpansForDay, membersOutAt, workOccurrencesInRange, type ScheduleBlock, type CarDayOverride } from './carResolve'
import { localDayStart, localTimeOnDay, addLocalDays } from './ids'

// Anchor on a real LOCAL midnight (a normal, non-DST June day) so the resolver's
// localTimeOnDay-based instant math lines up with the test's expectations. `at`
// mirrors the resolver's own conversion (delegated to the DST-safe helper), so the
// assertions exercise the filtering/mapping logic, not instant arithmetic (that's
// covered by ids/recur tests).
const DAY = localDayStart(new Date(Date.UTC(2026, 5, 3, 12))) // Wed 2026-06-03, local midnight
const min = (h: number, m = 0) => h * 60 + m
const at = (h: number, m = 0) => localTimeOnDay(DAY, (h * 60 + m) * 60)

// Marc works Mon–Fri 8–17 and takes the car; Julie has Tue/Thu 9–15 but on the bus
// (presence only, car stays home).
const MARC: ScheduleBlock = { id: 'b1', memberId: 'marc', label: 'Travail', startMin: min(8), endMin: min(17), weekdays: [1, 2, 3, 4, 5], holdsCar: true }
const JULIE: ScheduleBlock = { id: 'b2', memberId: 'julie', label: 'Travail', startMin: min(9), endMin: min(15), weekdays: [2, 4], holdsCar: false }
const BLOCKS = [MARC, JULIE]

describe('carBusySpansForDay — template', () => {
  it('busies the car on a weekday Marc works (holds_car)', () => {
    const spans = carBusySpansForDay(DAY, 3 /* Wed */, BLOCKS)
    expect(spans).toEqual([{ start: at(8), end: at(17), label: 'Travail', holderId: 'marc' }])
  })

  it('ignores a non-car block (Julie on the bus) — car stays home', () => {
    // Thursday: Marc (car) 8–17 + Julie (no car) 9–15 → only Marc's span.
    const spans = carBusySpansForDay(DAY, 4 /* Thu */, BLOCKS)
    expect(spans).toEqual([{ start: at(8), end: at(17), label: 'Travail', holderId: 'marc' }])
  })

  it('is free on a weekend (no blocks match)', () => {
    expect(carBusySpansForDay(DAY, 0 /* Sun */, BLOCKS)).toEqual([])
  })

  it('drops an inverted block defensively', () => {
    const bad: ScheduleBlock = { id: 'x', memberId: 'm', startMin: min(17), endMin: min(8), weekdays: [1], holdsCar: true }
    expect(carBusySpansForDay(DAY, 1, [bad])).toEqual([])
  })
})

describe('carBusySpansForDay — per-date override', () => {
  it('a "free" override clears the template (car stays home that day)', () => {
    const ov: CarDayOverride = { carId: 'car', day: DAY, free: true }
    expect(carBusySpansForDay(DAY, 3 /* Wed, would be busy */, BLOCKS, ov)).toEqual([])
  })

  it('a windowed override REPLACES the template for that day', () => {
    const ov: CarDayOverride = { carId: 'car', day: DAY, free: false, holderId: 'julie', startMin: min(10), endMin: min(12), label: 'Julie — rendez-vous' }
    expect(carBusySpansForDay(DAY, 3, BLOCKS, ov)).toEqual([
      { start: at(10), end: at(12), label: 'Julie — rendez-vous', holderId: 'julie' },
    ])
  })

  it('a non-free override with no usable window = car free that day', () => {
    const ov: CarDayOverride = { carId: 'car', day: DAY, free: false }
    expect(carBusySpansForDay(DAY, 3, BLOCKS, ov)).toEqual([])
  })
})

describe('carBusySpansForDay — every-N-weeks recurrence (#28)', () => {
  // Marc works the car every OTHER Wednesday, phased from DAY's week (week 0 = "on").
  const BIWEEKLY: ScheduleBlock = { id: 'bi', memberId: 'marc', startMin: min(8), endMin: min(17), weekdays: [3], holdsCar: true, weekInterval: 2, anchorDay: DAY }

  it('is busy on the anchor week (an "on" week)', () => {
    expect(carBusySpansForDay(DAY, 3, [BIWEEKLY])).toEqual([{ start: at(8), end: at(17), label: undefined, holderId: 'marc' }])
  })
  it('is free the following week (an "off" week)', () => {
    const nextWed = addLocalDays(DAY, 7)
    expect(carBusySpansForDay(nextWed, 3, [BIWEEKLY])).toEqual([])
  })
  it('is busy again two weeks on', () => {
    const wedPlus2 = addLocalDays(DAY, 14)
    expect(carBusySpansForDay(wedPlus2, 3, [BIWEEKLY]).length).toBe(1)
  })
  it('interval 1 (or a missing anchor) behaves as every week', () => {
    const weekly: ScheduleBlock = { ...BIWEEKLY, weekInterval: 1, anchorDay: null }
    expect(carBusySpansForDay(addLocalDays(DAY, 7), 3, [weekly]).length).toBe(1)
  })
})

describe('workOccurrencesInRange — derived schedule (calendar/agenda)', () => {
  it('emits one window per matching weekday in the range', () => {
    // A single Wednesday window → exactly Marc's + (Julie is Tue/Thu, so none today).
    const occs = workOccurrencesInRange(BLOCKS, DAY, addLocalDays(DAY, 1))
    expect(occs).toEqual([
      { id: `work:b1:${DAY}`, blockId: 'b1', memberId: 'marc', label: 'Travail', startAt: at(8), endAt: at(17), holdsCar: true, color: null },
    ])
  })
  it('includes non-car (presence-only) blocks too — they surface on the calendar', () => {
    // Thursday: Marc (car) + Julie (bus) both have a window.
    const thu = addLocalDays(DAY, 1)
    const occs = workOccurrencesInRange(BLOCKS, thu, addLocalDays(thu, 1))
    expect(occs.map((o) => o.memberId).sort()).toEqual(['julie', 'marc'])
    expect(occs.find((o) => o.memberId === 'julie')?.holdsCar).toBe(false)
  })
  it('respects every-N-weeks (off weeks produce no window)', () => {
    const bi: ScheduleBlock = { id: 'bi', memberId: 'marc', startMin: min(8), endMin: min(17), weekdays: [3], holdsCar: true, weekInterval: 2, anchorDay: DAY }
    const offWed = addLocalDays(DAY, 7)
    expect(workOccurrencesInRange([bi], offWed, addLocalDays(offWed, 1))).toEqual([])
  })
})

describe('membersOutAt — derived presence', () => {
  it('lists everyone out at a given instant (car-holding or not)', () => {
    // Thursday 10:00 — both Marc (8–17) and Julie (9–15) are out.
    expect(membersOutAt(DAY, 4, BLOCKS, at(10)).sort()).toEqual(['julie', 'marc'])
  })
  it('nobody out before the first block', () => {
    expect(membersOutAt(DAY, 4, BLOCKS, at(7))).toEqual([])
  })
  it('only Marc out at 16:00 (Julie already home)', () => {
    expect(membersOutAt(DAY, 4, BLOCKS, at(16))).toEqual(['marc'])
  })
})
