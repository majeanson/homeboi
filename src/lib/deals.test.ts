import { describe, expect, it } from 'vitest'
import { dealEnded } from './deals'

// A local timestamp, the way a household's clock reads it.
const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).getTime()

describe('dealEnded', () => {
  it('is valid THROUGH the validTo day, ended from the next midnight', () => {
    expect(dealEnded('2026-09-01', at(2026, 9, 1, 23))).toBe(false)
    expect(dealEnded('2026-09-01', at(2026, 9, 2, 0))).toBe(true)
    expect(dealEnded('2026-09-01', at(2026, 9, 5))).toBe(true)
  })

  it('reads the calendar date as LOCAL, not the UTC parse', () => {
    // new Date('2026-09-01') is UTC midnight — the evening of Aug 31 in Québec.
    // Parsed that way the deal would read ended a day early; the date-part read
    // keeps it valid all of Sep 1 local.
    expect(dealEnded('2026-09-01', at(2026, 9, 1, 8))).toBe(false)
    expect(dealEnded('2026-09-01', at(2026, 8, 31, 23))).toBe(false)
  })

  it('a full ISO stamp uses its date part the same way', () => {
    expect(dealEnded('2026-09-01T00:00:00-04:00', at(2026, 9, 1, 18))).toBe(false)
    expect(dealEnded('2026-09-01T00:00:00-04:00', at(2026, 9, 2, 1))).toBe(true)
  })

  it('unknown validity is never flagged (unknown ≠ ended)', () => {
    expect(dealEnded(null)).toBe(false)
    expect(dealEnded(undefined)).toBe(false)
    expect(dealEnded('')).toBe(false)
    expect(dealEnded('n/a')).toBe(false)
  })
})
