import { describe, it, expect } from 'vitest'
import { parseRecur, normalizeRecur, occurrenceOn, expandRange, rotationOffset } from './recur'
import { localDayStart, localDayOfWeek } from './ids'

// Recurrence is HOUSEHOLD-LOCAL (America/Toronto). Anchor: Wed 2026-01-07 09:30
// local (= 14:30 UTC in January/EST). (2026-01-07 is a Wednesday.)
const WED = Math.floor(Date.UTC(2026, 0, 7, 14, 30) / 1000)
// A day boundary the engine expects: LOCAL midnight of a Toronto calendar date.
// (noon UTC is safely inside that civil date in any North-American zone.)
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))
// The wall hour (0–23) of an instant in the household tz.
const localHour = (at: number) =>
  Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: '2-digit', hour12: false }).format(
      new Date(at * 1000),
    ),
  ) % 24

describe('parseRecur', () => {
  it('returns null for empty / malformed / bad freq', () => {
    expect(parseRecur(null)).toBeNull()
    expect(parseRecur('')).toBeNull()
    expect(parseRecur('{nope')).toBeNull()
    expect(parseRecur('{"freq":"hourly"}')).toBeNull()
  })
  it('parses a valid weekly rule', () => {
    expect(parseRecur('{"freq":"weekly","weekdays":[3]}')).toEqual({ freq: 'weekly', weekdays: [3] })
  })
  it('parses a yearly rule', () => {
    expect(parseRecur('{"freq":"yearly","interval":1}')).toEqual({ freq: 'yearly', interval: 1 })
  })
})

describe('normalizeRecur', () => {
  it('rejects non-rules', () => {
    expect(normalizeRecur(null)).toBeNull()
    expect(normalizeRecur({ freq: 'hourly' })).toBeNull()
  })
  it('accepts yearly and drops any weekday cruft (weekly-only)', () => {
    expect(normalizeRecur({ freq: 'yearly', interval: 2, weekdays: [1] })).toEqual({ freq: 'yearly', interval: 2 })
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

describe('occurrenceOn (yearly on the anchor month+day — a birthday/anniversary)', () => {
  const r = { freq: 'yearly' as const }
  it('hits the anchor date and the same date next year, carrying the time-of-day', () => {
    expect(occurrenceOn(d(2026, 0, 7), WED, r)).toBe(WED) // anchor Jan 7, 14:30 offset
    expect(occurrenceOn(d(2027, 0, 7), WED, r)).not.toBeNull() // Jan 7 next year
  })
  it('misses another day, and the anchor day in a different month', () => {
    expect(occurrenceOn(d(2027, 0, 8), WED, r)).toBeNull() // Jan 8
    expect(occurrenceOn(d(2027, 1, 7), WED, r)).toBeNull() // Feb 7
  })
  it('never precedes the anchor year', () => {
    expect(occurrenceOn(d(2025, 0, 7), WED, r)).toBeNull()
  })
  it('respects an interval (every 2 years)', () => {
    const r2 = { freq: 'yearly' as const, interval: 2 }
    expect(occurrenceOn(d(2027, 0, 7), WED, r2)).toBeNull() // +1 year, skip
    expect(occurrenceOn(d(2028, 0, 7), WED, r2)).not.toBeNull() // +2 years, hit
  })
  it('a Feb-29 anchor recurs only in leap years (no rollover to Mar 1)', () => {
    // Sat 2028-02-29 09:30 local (2028 is a leap year).
    const FEB29 = Math.floor(Date.UTC(2028, 1, 29, 14, 30) / 1000)
    expect(occurrenceOn(d(2028, 1, 29), FEB29, r)).not.toBeNull() // the anchor
    expect(occurrenceOn(d(2032, 1, 29), FEB29, r)).not.toBeNull() // next leap-year Feb 29
    expect(occurrenceOn(d(2029, 1, 29), FEB29, r)).toBeNull() // 2029 has no Feb 29
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
    const start = localDayStart(new Date(WED * 1000))
    const occ = expandRange(WED, r, start, start + 21 * 86400)
    expect(occ).toHaveLength(3)
    expect(occ[0]).toBeLessThan(occ[1])
  })
  it('lists a yearly series across a 2-year window (anchor year + next)', () => {
    const r = { freq: 'yearly' as const }
    const start = localDayStart(new Date(WED * 1000))
    const occ = expandRange(WED, r, start, start + 400 * 86400)
    expect(occ).toHaveLength(2)
    expect(occ[0]).toBeLessThan(occ[1])
  })
})

// Regression: the one-day-early bug. "Every 3 weeks on Thursday" anchored to a
// Thursday EVENING — which is the NEXT day in UTC — used to pin every occurrence to
// UTC-Thursday-midnight (= Wednesday ~19:00 local), so the series showed in À venir
// and on the month grid one day too early. Local-day math fixes it.
describe('occurrenceOn (local-day correctness — evening anchor that flips the UTC date)', () => {
  // Thu 2026-01-08 20:00 America/Toronto (EST, UTC-5) = Fri 2026-01-09 01:00 UTC.
  const THU_EVE = Math.floor(Date.UTC(2026, 0, 9, 1, 0) / 1000)
  const r = { freq: 'weekly' as const, interval: 3, weekdays: [4] } // every 3 weeks, Thursday
  it('the anchor reads as a LOCAL Thursday despite a UTC-Friday timestamp', () => {
    expect(localDayOfWeek(new Date(THU_EVE * 1000))).toBe(4) // Thu, not Fri
  })
  it('fires on the local Thursday and NOT the day before', () => {
    const at = occurrenceOn(d(2026, 0, 8), THU_EVE, r) // Thu Jan 8 (local)
    expect(at).not.toBeNull()
    expect(localDayOfWeek(new Date((at as number) * 1000))).toBe(4) // lands on Thursday
    expect(occurrenceOn(d(2026, 0, 7), THU_EVE, r)).toBeNull() // NOT Wednesday (the bug)
  })
  it('repeats every 3 weeks, skipping the two weeks between', () => {
    expect(occurrenceOn(d(2026, 0, 15), THU_EVE, r)).toBeNull() // +1 week
    expect(occurrenceOn(d(2026, 0, 22), THU_EVE, r)).toBeNull() // +2 weeks
    expect(occurrenceOn(d(2026, 0, 29), THU_EVE, r)).not.toBeNull() // +3 weeks
  })
})

// Regression: the DST exact-boundary hour. A weekly 09:00 series must stay 09:00
// local even on the spring-forward day, when the naive midnight+elapsed-seconds math
// lands at 10:00 (the day lost an hour at 02:00). localTimeOnDay holds the wall time.
describe('occurrenceOn (DST — wall time held across the transition day)', () => {
  // Sun 2026-03-01 09:00 America/Toronto (EST, UTC-5) = 14:00 UTC. Spring forward is
  // the 2nd Sunday, 2026-03-08 02:00→03:00. Weekly every Sunday at 09:00.
  const SUN_9AM = Math.floor(Date.UTC(2026, 2, 1, 14, 0) / 1000)
  const r = { freq: 'weekly' as const, weekdays: [0] }
  it('anchor Sunday is 09:00 local', () => {
    expect(localHour(occurrenceOn(d(2026, 2, 1), SUN_9AM, r) as number)).toBe(9)
  })
  it('stays 09:00 ON the spring-forward Sunday (not 10:00)', () => {
    const at = occurrenceOn(d(2026, 2, 8), SUN_9AM, r)
    expect(at).not.toBeNull()
    expect(localDayOfWeek(new Date((at as number) * 1000))).toBe(0) // Sunday
    expect(localHour(at as number)).toBe(9)
  })
  it('stays 09:00 the following EDT Sunday', () => {
    expect(localHour(occurrenceOn(d(2026, 2, 15), SUN_9AM, r) as number)).toBe(9)
  })
})
