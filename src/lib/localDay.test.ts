import { describe, it, expect } from 'vitest'
import { addLocalDays, localDayStart, localYMD, daysUntilLocal } from './localDay'

const DAY = 86400
const TZ = 'America/Toronto'

// The meal week (AddSheet / RecipeViewPage), the month grid and the DevKit demo all
// step a window of days off a local-midnight anchor with addLocalDays(). A plain
// `+ i*86400` step drifts an hour across a DST boundary (a local day is 23h or 25h),
// landing a cell on the wrong calendar date twice a year. These pin the snap.
describe('addLocalDays', () => {
  it('lands on local midnight for every step (no DST month)', () => {
    // June 2026 — no DST change, so each step is a clean 24h and stays at midnight.
    const start = localDayStart(new Date('2026-06-01T12:00:00Z'), TZ)
    for (let i = 0; i < 10; i++) {
      const d = addLocalDays(start, i)
      expect(d).toBe(start + i * DAY) // no boundary crossed → matches naive stepping
      expect(localYMD(d, TZ).day).toBe(1 + i)
    }
  })

  it('advances exactly one calendar day across spring-forward (23h day)', () => {
    // DST springs forward Sun Mar 8 2026 in America/Toronto; that local day is 23h.
    const start = localDayStart(new Date('2026-03-06T12:00:00Z'), TZ) // Fri Mar 6
    const days = Array.from({ length: 5 }, (_, i) => addLocalDays(start, i))
    expect(days.map((d) => localYMD(d, TZ).day)).toEqual([6, 7, 8, 9, 10])
    // The Mar 8 → Mar 9 step must be the short 23h day; naive +86400 would overshoot.
    const springGap = days[3] - days[2]
    expect(springGap).toBe(DAY - 3600)
  })

  it('advances exactly one calendar day across fall-back (25h day)', () => {
    // DST falls back Sun Nov 1 2026; that local day is 25h.
    const start = localDayStart(new Date('2026-10-30T12:00:00Z'), TZ) // Fri Oct 30
    const days = Array.from({ length: 5 }, (_, i) => addLocalDays(start, i))
    expect(days.map((d) => localYMD(d, TZ).day)).toEqual([30, 31, 1, 2, 3])
    const fallGap = days[3] - days[2] // Nov 1 → Nov 2
    expect(fallGap).toBe(DAY + 3600)
  })

  it('rolls month and year over (Date.UTC carries the overflow)', () => {
    const start = localDayStart(new Date('2026-12-30T12:00:00Z'), TZ)
    const d = addLocalDays(start, 3) // → Jan 2 2027
    expect(localYMD(d, TZ)).toMatchObject({ year: 2027, month: 0, day: 2 })
  })

  it('daysUntilLocal counts whole local days across spring-forward', () => {
    const now = localDayStart(new Date('2026-03-06T12:00:00Z'), TZ)
    const target = addLocalDays(now, 5)
    expect(daysUntilLocal(target, now * 1000, TZ)).toBe(5)
  })
})
