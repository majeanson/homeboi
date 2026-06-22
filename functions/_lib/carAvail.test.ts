import { describe, it, expect } from 'vitest'
import { mergeSpans, freeGaps, busyAt, carStatusAt, rideConflicts, type CarSpan, type Ride } from './carAvail'

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
})

describe('rideConflicts', () => {
  const busy: CarSpan[] = [{ start: h(8), end: h(18), label: 'au travail' }]
  it('flags a car-taking ride that lands while the car is committed', () => {
    const rides: Ride[] = [{ id: 'r1', at: h(17), label: 'Épicerie', carId: 'car' }]
    const conflicts = rideConflicts(busy, rides)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].ride.id).toBe('r1')
    expect(conflicts[0].span.label).toBe('au travail')
  })

  it('does NOT flag a carpool ride (no car needed)', () => {
    const rides: Ride[] = [{ id: 'r2', at: h(17), label: 'Soccer (Sophie conduit)', carId: null }]
    expect(rideConflicts(busy, rides)).toEqual([])
  })

  it('does NOT flag a car-taking ride that fits in a free gap', () => {
    const rides: Ride[] = [{ id: 'r3', at: h(19), label: 'Épicerie', carId: 'car' }]
    expect(rideConflicts(busy, rides)).toEqual([])
  })

  it('a ride exactly on the span end is fine (car just back)', () => {
    const rides: Ride[] = [{ id: 'r4', at: h(18), label: 'Épicerie', carId: 'car' }]
    expect(rideConflicts(busy, rides)).toEqual([])
  })
})
