import { describe, it, expect } from 'vitest'
import { monthGrid, inMonth, stepMonthDay } from './monthgrid'
import { localYMD, localDayOfWeek, addLocalDays } from './localDay'

const DAY = 86400

describe('monthGrid', () => {
  it('always returns a full six-week grid', () => {
    expect(monthGrid(2026, 5).days).toHaveLength(42)
  })

  it('starts on a Sunday and runs consecutive days (no DST month)', () => {
    const g = monthGrid(2026, 5) // June 2026 — no DST change, so every step is 24h
    expect(localDayOfWeek(new Date(g.days[0] * 1000))).toBe(0)
    for (let i = 1; i < g.days.length; i++) {
      expect(g.days[i] - g.days[i - 1]).toBe(DAY)
    }
  })

  it('steps by one LOCAL calendar day across a spring-forward DST boundary', () => {
    // March 2026: DST springs forward Sun Mar 8. The local day there is only 23h,
    // so fixed-86400 stepping would drift; the grid must still advance the calendar
    // date by exactly one each cell, and one step must be the short 23h day.
    const g = monthGrid(2026, 2) // March 2026
    let shortDays = 0
    for (let i = 1; i < g.days.length; i++) {
      const prev = localYMD(g.days[i - 1])
      const cur = localYMD(g.days[i])
      // Each cell is the next calendar day (handles month rollover via the Date).
      const expected = new Date(Date.UTC(prev.year, prev.month, prev.day + 1))
      expect(cur.day).toBe(expected.getUTCDate())
      expect(cur.month).toBe(expected.getUTCMonth())
      const gap = g.days[i] - g.days[i - 1]
      if (gap === DAY - 3600) shortDays++
      expect([DAY, DAY - 3600, DAY + 3600]).toContain(gap)
    }
    expect(shortDays).toBe(1) // exactly the spring-forward day is 23h
  })

  it('contains the first of the focused month', () => {
    const g = monthGrid(2026, 5)
    expect(g.days).toContain(g.monthStart)
    expect(g.gridStart).toBeLessThanOrEqual(g.monthStart)
  })

  it('normalizes an out-of-range month forward across the year', () => {
    const g = monthGrid(2026, 12) // → January 2027
    expect(g.year).toBe(2027)
    expect(g.month).toBe(0)
  })

  it('normalizes an out-of-range month backward across the year', () => {
    const g = monthGrid(2026, -1) // → December 2025
    expect(g.year).toBe(2025)
    expect(g.month).toBe(11)
  })

  it('inMonth flags spill days from adjacent months', () => {
    const g = monthGrid(2026, 5) // June: the 1st is a Monday, so day[0] is in May
    expect(inMonth(g.days[0], g.month)).toBe(false)
    expect(inMonth(g.monthStart, g.month)).toBe(true)
  })
})

describe('stepMonthDay', () => {
  // A picked day, not an offset, is what the calendar stores — so ‹ › have to MOVE the
  // day. These pin the two ways that goes wrong: overshooting a short month, and the
  // year boundary.
  const dayOf = (y: number, m: number, d: number) => addLocalDays(monthGrid(y, m).monthStart, d - 1)

  it('keeps the day-of-month when the target month is long enough', () => {
    expect(stepMonthDay(dayOf(2026, 7, 14), 1)).toBe(dayOf(2026, 8, 14)) // 14 Aug → 14 Sep
    expect(stepMonthDay(dayOf(2026, 7, 14), -1)).toBe(dayOf(2026, 6, 14)) // 14 Aug → 14 Jul
  })

  it('clamps to the last day rather than overshooting into the next month', () => {
    // 31 Aug + 1 month is 31 Sep — which does not exist. It must be 30 Sep, NOT 1 Oct,
    // or one tap of › would skip a whole month.
    expect(stepMonthDay(dayOf(2026, 7, 31), 1)).toBe(dayOf(2026, 8, 30))
    // 31 Mar − 1 month → 28 Feb (2026 is not a leap year).
    expect(stepMonthDay(dayOf(2026, 2, 31), -1)).toBe(dayOf(2026, 1, 28))
    // …and 29 Feb exists in a leap year.
    expect(stepMonthDay(dayOf(2028, 2, 31), -1)).toBe(dayOf(2028, 1, 29))
  })

  it('crosses the year boundary in both directions', () => {
    expect(stepMonthDay(dayOf(2026, 11, 15), 1)).toBe(dayOf(2027, 0, 15)) // 15 Dec → 15 Jan
    expect(stepMonthDay(dayOf(2026, 0, 15), -1)).toBe(dayOf(2025, 11, 15)) // 15 Jan → 15 Dec
  })

  it('walks a full year one step at a time without drifting', () => {
    let d = dayOf(2026, 0, 15)
    for (let i = 0; i < 12; i++) d = stepMonthDay(d, 1)
    expect(d).toBe(dayOf(2027, 0, 15))
  })
})
