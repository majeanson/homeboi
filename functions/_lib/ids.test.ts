// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { localDayStart, localDayOfWeek, HOUSEHOLD_TZ } from './ids'

// The wall-clock hour:minute of a unix-seconds instant, in the household tz.
const wallHM = (sec: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: HOUSEHOLD_TZ, hour12: false, hour: '2-digit', minute: '2-digit' }).format(
    new Date(sec * 1000),
  )

describe('localDayStart', () => {
  it('buckets to LOCAL midnight, not 8 PM (the UTC-bucketing bug)', () => {
    // 2026-06-15 21:30 EDT === 2026-06-16 01:30 UTC. Bucketing in UTC would roll
    // this to June 16; locally it's still June 15.
    const evening = Date.UTC(2026, 5, 16, 1, 30) / 1000
    const start = localDayStart(new Date(evening * 1000))
    expect(wallHM(start)).toBe('00:00') // lands on local midnight
    expect(start).toBe(Date.UTC(2026, 5, 15, 4, 0) / 1000) // 00:00 EDT = 04:00 UTC
    expect(evening - start).toBeLessThan(86400) // the instant is inside that day
  })

  it('groups morning and late-evening of the same local day together', () => {
    const afternoon = Date.UTC(2026, 5, 15, 16, 0) / 1000 // 12:00 EDT
    const lateEve = Date.UTC(2026, 5, 16, 2, 0) / 1000 // 22:00 EDT same local day
    expect(localDayStart(new Date(afternoon * 1000))).toBe(localDayStart(new Date(lateEve * 1000)))
  })

  it('is DST-correct in winter (EST = UTC-5)', () => {
    // 2026-01-15 22:00 EST === 2026-01-16 03:00 UTC.
    const winterEve = Date.UTC(2026, 0, 16, 3, 0) / 1000
    const start = localDayStart(new Date(winterEve * 1000))
    expect(wallHM(start)).toBe('00:00')
    expect(start).toBe(Date.UTC(2026, 0, 15, 5, 0) / 1000) // 00:00 EST = 05:00 UTC
  })
})

describe('localDayOfWeek', () => {
  it('uses the LOCAL day, not getUTCDay', () => {
    // 2026-06-16 01:30 UTC is Tuesday in UTC but still Monday (1) in Eastern.
    const instant = new Date(Date.UTC(2026, 5, 16, 1, 30))
    expect(instant.getUTCDay()).toBe(2) // Tuesday in UTC
    expect(localDayOfWeek(instant)).toBe(1) // Monday locally
  })
})
