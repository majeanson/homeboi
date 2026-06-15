import { describe, it, expect } from 'vitest'
import { parseRecur, normalizeRecur, occurrenceOn, expandRange, rotationOffset } from './recur'
import { dayStart } from './ids'

// A fixed UTC anchor: Wed 2026-01-07 14:30 UTC. (2026-01-07 is a Wednesday.)
const WED = Math.floor(Date.UTC(2026, 0, 7, 14, 30) / 1000)
const d = (y: number, m: number, day: number) => Math.floor(Date.UTC(y, m, day) / 1000)

describe('parseRecur', () => {
  it('returns null for empty / malformed / bad freq', () => {
    expect(parseRecur(null)).toBeNull()
    expect(parseRecur('')).toBeNull()
    expect(parseRecur('{nope')).toBeNull()
    expect(parseRecur('{"freq":"yearly"}')).toBeNull()
  })
  it('parses a valid weekly rule', () => {
    expect(parseRecur('{"freq":"weekly","weekdays":[3]}')).toEqual({ freq: 'weekly', weekdays: [3] })
  })
})

describe('normalizeRecur', () => {
  it('rejects non-rules', () => {
    expect(normalizeRecur(null)).toBeNull()
    expect(normalizeRecur({ freq: 'yearly' })).toBeNull()
  })
  it('clamps interval and dedupes/sorts/validates weekdays', () => {
    expect(normalizeRecur({ freq: 'weekly', interval: 99, weekdays: [3, 3, 9, 1, -1] })).toEqual({
      freq: 'weekly',
      interval: 52,
      weekdays: [1, 3],
    })
  })
  it('defaults interval to 1', () => {
    expect(normalizeRecur({ freq: 'daily' })).toEqual({ freq: 'daily', interval: 1 })
  })
})

describe('occurrenceOn (weekly every Wednesday)', () => {
  const r = { freq: 'weekly' as const, weekdays: [3] }
  it('hits the anchor Wednesday, carrying the time-of-day', () => {
    const at = occurrenceOn(d(2026, 0, 7), WED, r)
    expect(at).toBe(WED) // same day + 14:30 offset
  })
  it('hits the next Wednesday', () => {
    expect(occurrenceOn(d(2026, 0, 14), WED, r)).not.toBeNull()
  })
  it('misses non-Wednesdays', () => {
    expect(occurrenceOn(d(2026, 0, 8), WED, r)).toBeNull() // Thursday
  })
  it('never occurs before the anchor', () => {
    expect(occurrenceOn(d(2025, 11, 31), WED, r)).toBeNull()
  })
})

describe('occurrenceOn (biweekly)', () => {
  const r = { freq: 'weekly' as const, interval: 2, weekdays: [3] }
  it('hits the anchor week and 2 weeks later, skips the in-between week', () => {
    expect(occurrenceOn(d(2026, 0, 7), WED, r)).not.toBeNull()
    expect(occurrenceOn(d(2026, 0, 14), WED, r)).toBeNull()
    expect(occurrenceOn(d(2026, 0, 21), WED, r)).not.toBeNull()
  })
})

describe('occurrenceOn (daily every 3 days, monthly)', () => {
  it('daily interval', () => {
    const r = { freq: 'daily' as const, interval: 3 }
    expect(occurrenceOn(d(2026, 0, 7), WED, r)).not.toBeNull()
    expect(occurrenceOn(d(2026, 0, 8), WED, r)).toBeNull()
    expect(occurrenceOn(d(2026, 0, 10), WED, r)).not.toBeNull()
  })
  it('monthly on the same day-of-month', () => {
    const r = { freq: 'monthly' as const }
    expect(occurrenceOn(d(2026, 1, 7), WED, r)).not.toBeNull() // Feb 7
    expect(occurrenceOn(d(2026, 1, 8), WED, r)).toBeNull()
  })
})

describe('occurrenceOn (biweekly, two weekdays — same fortnight stays together)', () => {
  // Anchor Mon 2026-01-05; rule = every 2 weeks on Mon(1)+Thu(4).
  const MON = Math.floor(Date.UTC(2026, 0, 5, 8, 0) / 1000)
  const r = { freq: 'weekly' as const, interval: 2, weekdays: [1, 4] }
  it('hits both Mon and Thu of the anchor fortnight', () => {
    expect(occurrenceOn(d(2026, 0, 5), MON, r)).not.toBeNull() // Mon
    expect(occurrenceOn(d(2026, 0, 8), MON, r)).not.toBeNull() // Thu, same fortnight
  })
  it('skips the off week (both days)', () => {
    expect(occurrenceOn(d(2026, 0, 12), MON, r)).toBeNull() // Mon
    expect(occurrenceOn(d(2026, 0, 15), MON, r)).toBeNull() // Thu
  })
  it('hits again two weeks on', () => {
    expect(occurrenceOn(d(2026, 0, 19), MON, r)).not.toBeNull()
    expect(occurrenceOn(d(2026, 0, 22), MON, r)).not.toBeNull()
  })
})

describe('rotationOffset (project a shared chore forward)', () => {
  // Weekly every Wednesday, anchored 2026-01-07. refDay = the anchor Wednesday.
  const r = { freq: 'weekly' as const, weekdays: [3] }
  const ref = d(2026, 0, 7) // pending occurrence falls on/after here
  it('is 0 for the pending occurrence itself', () => {
    expect(rotationOffset(WED, r, ref, WED)).toBe(0)
  })
  it('advances one turn per future occurrence', () => {
    expect(rotationOffset(WED, r, ref, d(2026, 0, 14))).toBe(1) // next Wed
    expect(rotationOffset(WED, r, ref, d(2026, 0, 21))).toBe(2)
    expect(rotationOffset(WED, r, ref, d(2026, 0, 28))).toBe(3)
  })
  it('counts only real occurrences between refDay and target', () => {
    // Jan 15 is a Thursday; the two Wednesdays before it (Jan 7, Jan 14) count.
    expect(rotationOffset(WED, r, ref, d(2026, 0, 15))).toBe(2)
  })
  it('walks backwards for past cells', () => {
    // refDay one week after the anchor → the anchor Wed is one turn behind.
    expect(rotationOffset(WED, r, d(2026, 0, 14), WED)).toBe(-1)
  })
  it('daily rotation increments every day', () => {
    const daily = { freq: 'daily' as const }
    expect(rotationOffset(WED, daily, ref, d(2026, 0, 10))).toBe(3)
  })
})

describe('expandRange', () => {
  it('lists every Wednesday in a 3-week window, ascending', () => {
    const r = { freq: 'weekly' as const, weekdays: [3] }
    const start = dayStart(new Date(WED * 1000))
    const occ = expandRange(WED, r, start, start + 21 * 86400)
    expect(occ).toHaveLength(3)
    expect(occ[0]).toBeLessThan(occ[1])
  })
})
