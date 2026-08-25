import { describe, it, expect } from 'vitest'
import { mergeSpans, freeGaps, busyAt, carStatusAt, rideConflicts, rideSpans, rideWindow, RIDE_DEFAULT_SEC, type CarSpan, type Ride } from './carAvail'

// All instants are plain unix seconds on one synthetic day so the math reads as
// wall-clock hours. carAvail is timezone-agnostic, so a fixed base is enough — no TZ
// formatting needed (unlike whenparse/recur, which resolve local wall time).
const DAY = 1_700_000_000 // arbitrary day start (00:00)
const h = (n: number) => DAY + n * 3600 // hour N of the day
const DAY_END = h(24)

describe('mergeSpans', () => {
  it('drops empty and inverted spans', () => {
    expect(mergeSpans([{ start: h(9), end: h(9) }, { start: h(12), end: h(10) }])).toEqual([])
  })

  it('merges overlapping spans', () => {
    expect(mergeSpans([{ start: h(8), end: h(12) }, { start: h(10), end: h(14) }])).toEqual([
      { start: h(8), end: h(14) },
    ])
  })

  it('coalesces touching spans (no phantom gap at the seam)', () => {
    const merged = mergeSpans([{ start: h(8), end: h(12) }, { start: h(12), end: h(17) }])
    expect(merged).toEqual([{ start: h(8), end: h(17) }])
  })

  it('keeps disjoint spans separate and sorted', () => {
    const merged = mergeSpans([{ start: h(15), end: h(16) }, { start: h(8), end: h(9) }])
    expect(merged.map((s) => [s.start, s.end])).toEqual([
      [h(8), h(9)],
      [h(15), h(16)],
    ])
  })
})

describe('freeGaps', () => {
  it('returns the whole day when nothing is busy', () => {
    expect(freeGaps([], DAY, DAY_END)).toEqual([{ start: DAY, end: DAY_END }])
  })

  it('returns [] when the day is fully committed', () => {
    expect(freeGaps([{ start: DAY, end: DAY_END }], DAY, DAY_END)).toEqual([])
  })

  it('finds the gap around a work block (car at work 8–17)', () => {
    const busy: CarSpan[] = [{ start: h(8), end: h(17), label: 'au travail' }]
    expect(freeGaps(busy, h(6), h(22))).toEqual([
      { start: h(6), end: h(8) },
      { start: h(17), end: h(22) },
    ])
  })

  it('clamps spans that spill past the window edges', () => {
    const busy: CarSpan[] = [{ start: h(4), end: h(10) }]
    expect(freeGaps(busy, h(6), h(12))).toEqual([{ start: h(10), end: h(12) }])
  })
})

describe('busyAt', () => {
  const busy: CarSpan[] = [{ start: h(8), end: h(17), label: 'au travail' }]
  it('is busy inside the span', () => {
    expect(busyAt(busy, h(12))?.label).toBe('au travail')
  })
  it('is free at the exact end instant (the car is just back)', () => {
    expect(busyAt(busy, h(17))).toBeNull()
  })
  it('is busy at the exact start instant', () => {
    expect(busyAt(busy, h(8))?.label).toBe('au travail')
  })
  it('is free before and after', () => {
    expect(busyAt(busy, h(7))).toBeNull()
    expect(busyAt(busy, h(18))).toBeNull()
  })
})

describe('carStatusAt', () => {
  const busy: CarSpan[] = [{ start: h(8), end: h(17), label: 'au travail' }]
  it('free now, with the next commitment as "until"', () => {
    const s = carStatusAt(busy, h(6), DAY_END)
    expect(s.free).toBe(true)
    expect(s.until).toBe(h(8))
  })
  it('free for the rest of the day after the last commitment', () => {
    const s = carStatusAt(busy, h(18), DAY_END)
    expect(s.free).toBe(true)
    expect(s.until).toBeUndefined()
  })
  it('busy now, with "until" = when it frees up', () => {
    const s = carStatusAt(busy, h(12), DAY_END)
    expect(s.free).toBe(false)
    expect(s.until).toBe(h(17))
    expect(s.span?.label).toBe('au travail')
  })

  it('truly empty day → free all day, not committed', () => {
    const s = carStatusAt([], h(9), DAY_END)
    expect(s).toMatchObject({ free: true, committed: false })
    expect(s.until).toBeUndefined()
  })
})

describe('rideSpans', () => {
  const DAY_START = DAY
  it('turns a car-taking ride into a default-window busy span carrying the driver', () => {
    const rides: Ride[] = [{ id: 'r1', at: h(15), label: 'Épicerie', carId: 'car', holderId: 'm1' }]
    const spans = rideSpans(rides, DAY_START, DAY_END)
    expect(spans).toEqual([{ start: h(15), end: h(17), label: 'Épicerie', holderId: 'm1' }])
  })

  it('an all-day car ride holds the whole day', () => {
    const rides: Ride[] = [{ id: 'r1', at: h(0), carId: 'car', holderId: 'm1', allDay: true }]
    expect(rideSpans(rides, DAY_START, DAY_END)).toEqual([{ start: DAY_START, end: DAY_END, label: undefined, holderId: 'm1' }])
  })

  it('a carpool/bus ride (carId null) produces no span — it never takes our car', () => {
    const rides: Ride[] = [{ id: 'r1', at: h(15), label: 'Soccer (covoiturage)', carId: null }]
    expect(rideSpans(rides, DAY_START, DAY_END)).toEqual([])
  })

  it('clamps a late ride window to the end of the day', () => {
    const rides: Ride[] = [{ id: 'r1', at: h(23), carId: 'car' }]
    expect(rideSpans(rides, DAY_START, DAY_END)[0].end).toBe(DAY_END)
  })
})

// The board glance reads carStatusAt over schedule spans PLUS rideSpans — the bug was
// a ride (no work block) reading as "libre toute la journée". These cover that path.
describe('carStatusAt with ride spans folded in', () => {
  const rideAt = (n: number, holderId?: string): Ride => ({ id: `r${n}`, at: h(n), carId: 'car', holderId })
  const withRides = (spans: CarSpan[], rides: Ride[], t: number) =>
    carStatusAt([...spans, ...rideSpans(rides, DAY, DAY_END)], t, DAY_END)

  it('an in-progress car ride reads as busy now, back ≈ start + default, with the driver', () => {
    const s = withRides([], [rideAt(15, 'm1')], h(16)) // mid-ride (15→17)
    expect(s.free).toBe(false)
    expect(s.until).toBe(h(17))
    expect(s.span?.holderId).toBe('m1')
  })

  it('an upcoming car ride tightens "free until" instead of saying all day', () => {
    const s = withRides([], [rideAt(14)], h(9))
    expect(s).toMatchObject({ free: true, committed: true })
    expect(s.until).toBe(h(14))
  })

  it('a past car ride → free for the rest of the day (committed, no "until")', () => {
    const s = withRides([], [rideAt(8)], h(12)) // 8→10, now noon
    expect(s).toMatchObject({ free: true, committed: true })
    expect(s.until).toBeUndefined()
  })

  it('a carpool ride leaves the day genuinely free all day', () => {
    const s = withRides([], [{ id: 'r1', at: h(14), carId: null }], h(9))
    expect(s).toMatchObject({ free: true, committed: false })
    expect(s.until).toBeUndefined()
  })
})

describe('rideConflicts', () => {
  const busy: CarSpan[] = [{ start: h(8), end: h(18), label: 'au travail' }]
  const conflicts = (rides: Ride[]) => rideConflicts(busy, rides, DAY, DAY_END)

  it('flags a car-taking ride that lands while the car is committed', () => {
    const found = conflicts([{ id: 'r1', at: h(17), label: 'Épicerie', carId: 'car' }])
    expect(found).toHaveLength(1)
    expect(found[0].ride.id).toBe('r1')
    expect(found[0].span.label).toBe('au travail')
  })

  it('does NOT flag a ride that never takes our car', () => {
    expect(conflicts([{ id: 'r2', at: h(17), label: 'Soccer (Sophie conduit)', carId: null }])).toEqual([])
  })

  it('does NOT flag a car-taking ride that fits in a free gap', () => {
    expect(conflicts([{ id: 'r3', at: h(19), label: 'Épicerie', carId: 'car' }])).toEqual([])
  })

  it('a ride exactly on the span end is fine (car just back)', () => {
    expect(conflicts([{ id: 'r4', at: h(18), label: 'Épicerie', carId: 'car' }])).toEqual([])
  })

  // The whole WINDOW is tested, not just the start instant. Before this, a ride that
  // began in a free gap and ran straight into a busy block slipped through silently.
  it('flags a ride that STARTS free but runs into a committed block', () => {
    const found = conflicts([{ id: 'r5', at: h(7), endAt: h(9.5), label: 'Rendez-vous', carId: 'car' }])
    expect(found).toHaveLength(1)
    expect(found[0].ride.id).toBe('r5')
  })

  it('flags a ride whose 2 h DEFAULT window runs into a committed block', () => {
    // Starts at 7 h with no « Jusqu'à » → the default window reaches 9 h, inside 8–18.
    expect(conflicts([{ id: 'r6', at: h(7), carId: 'car' }])).toHaveLength(1)
  })

  it('does NOT flag a ride that ENDS exactly when the block starts', () => {
    expect(conflicts([{ id: 'r7', at: h(6), endAt: h(8), carId: 'car' }])).toEqual([])
  })

  it('an explicit « Jusqu’à » can clear a ride the 2 h default would have flagged', () => {
    // 7 h → 7 h 30 is over before the 8 h block; the flat default would have said 9 h.
    expect(conflicts([{ id: 'r8', at: h(7), endAt: h(7.5), carId: 'car' }])).toEqual([])
  })

  it('an all-day car ride collides with any block that day', () => {
    expect(conflicts([{ id: 'r9', at: h(0), carId: 'car', allDay: true }])).toHaveLength(1)
  })
})

// « Jusqu'à » (events.end_at) makes the occupied window exact instead of a flat guess.
describe('rideWindow — explicit duration vs the default', () => {
  it('an explicit end wins over the 2 h default', () => {
    const w = rideWindow({ id: 'r1', at: h(16), endAt: h(19.5), carId: 'car' }, DAY, DAY_END)
    expect(w).toEqual({ start: h(16), end: h(19.5), label: undefined, holderId: null })
  })

  it('falls back to the default window when no end is given', () => {
    expect(rideWindow({ id: 'r2', at: h(16), carId: 'car' }, DAY, DAY_END).end).toBe(h(18))
  })

  it('ignores an end that is not after the start', () => {
    expect(rideWindow({ id: 'r3', at: h(16), endAt: h(16), carId: 'car' }, DAY, DAY_END).end).toBe(h(18))
  })

  it('clamps an explicit end to the end of the day', () => {
    expect(rideWindow({ id: 'r4', at: h(23), endAt: h(26), carId: 'car' }, DAY, DAY_END).end).toBe(DAY_END)
  })

  it('all-day still wins over an explicit end', () => {
    const w = rideWindow({ id: 'r5', at: h(9), endAt: h(11), carId: 'car', allDay: true }, DAY, DAY_END)
    expect(w.start).toBe(DAY)
    expect(w.end).toBe(DAY_END)
  })
})

describe('RIDE_DEFAULT_SEC — the shared fallback', () => {
  it('is what rideWindow falls back to when a rendez-vous says no end', () => {
    const w = rideWindow({ id: 'r1', at: h(10), carId: 'car' }, DAY, DAY_END)
    expect(w.end - w.start).toBe(RIDE_DEFAULT_SEC)
  })
})
