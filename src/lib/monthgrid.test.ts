import { describe, it, expect } from 'vitest'
import { monthGrid, inMonth } from './monthgrid'

const DAY = 86400

describe('monthGrid', () => {
  it('always returns a full six-week grid', () => {
    expect(monthGrid(2026, 5).days).toHaveLength(42)
  })

  it('starts on a Sunday and runs consecutive days', () => {
    const g = monthGrid(2026, 5) // June 2026
    expect(new Date(g.days[0] * 1000).getUTCDay()).toBe(0)
    for (let i = 1; i < g.days.length; i++) {
      expect(g.days[i] - g.days[i - 1]).toBe(DAY)
    }
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
