import { describe, it, expect } from 'vitest'
import { tripDays, tripCategoryIcon, TRIP_CATEGORIES } from './voyage'
import { localDayStart, addLocalDays } from '../../lib/localDay'

// tripDays drives the Itinéraire tab (one section per day) AND the calendar band
// (which days a trip covers). It must be inclusive of both ends, DST-safe (it steps
// via addLocalDays, not a fixed +86400), and total/empty-safe for bad ranges.
describe('tripDays', () => {
  const d0 = localDayStart(new Date('2026-06-12T12:00:00'))
  const d2 = addLocalDays(d0, 2)

  it('returns every local-midnight day inclusive of both ends', () => {
    const days = tripDays(d0, d2)
    expect(days).toHaveLength(3)
    expect(days[0]).toBe(d0)
    expect(days[2]).toBe(d2)
    // strictly increasing, each one local-day apart
    expect(days[1]).toBe(addLocalDays(d0, 1))
  })

  it('is a single day when start === end', () => {
    expect(tripDays(d0, d0)).toEqual([d0])
  })

  it('is empty for a missing bound or an inverted range', () => {
    expect(tripDays(null, d2)).toEqual([])
    expect(tripDays(d0, null)).toEqual([])
    expect(tripDays(d2, d0)).toEqual([])
  })

  it('caps a runaway range rather than looping unbounded', () => {
    const far = addLocalDays(d0, 1000)
    expect(tripDays(d0, far, 120)).toHaveLength(120)
  })

  // Spans a spring-forward boundary (2026 DST in America/Toronto is 2026-03-08): the
  // day count must still be exact, not drift an hour into a wrong bucket.
  it('stays exact across a DST boundary', () => {
    const a = localDayStart(new Date('2026-03-07T12:00:00'))
    const b = addLocalDays(a, 3) // crosses the spring-forward
    expect(tripDays(a, b)).toHaveLength(4)
  })
})

describe('trip categories', () => {
  it('every category resolves to a real shared icon', () => {
    for (const c of TRIP_CATEGORIES) expect(tripCategoryIcon(c.key)).toBe(c.icon)
  })
  it('an unknown category falls back, never throws', () => {
    // @ts-expect-error — defensive: a stale row could carry an unknown category.
    expect(tripCategoryIcon('mystery')).toBe('push-pin-bold')
  })
})
