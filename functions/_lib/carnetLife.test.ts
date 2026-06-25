import { describe, it, expect } from 'vitest'
import { replacementAt, carnetLifeSoon, type CarnetLifeItem } from './carnetLife'

const sec = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d, 12) / 1000)

describe('replacementAt', () => {
  it('adds the lifespan in whole months', () => {
    const at = replacementAt(sec(2020, 0, 15), 144) // installed Jan 2020, ~12 yr
    expect(new Date(at * 1000).getFullYear()).toBe(2032)
  })

  it('handles a sub-year lifespan (tires ~6 yr in months)', () => {
    const at = replacementAt(sec(2024, 2, 1), 72) // Mar 2024 + 72 mo → Mar 2030
    expect(new Date(at * 1000).getFullYear()).toBe(2030)
  })
})

describe('carnetLifeSoon', () => {
  const now = sec(2026, 0, 1)
  const items: CarnetLifeItem[] = [
    { carnetId: 'a', name: 'Vieux chauffe-eau', kind: 'appliance', color: null, installedAt: sec(2000, 0, 1), lifespanMonths: 12 }, // overdue
    { carnetId: 'b', name: 'Toiture neuve', kind: 'system', color: null, installedAt: sec(2025, 0, 1), lifespanMonths: 1200 }, // far off
    { carnetId: 'c', name: 'Pneus', kind: 'thing', color: null, installedAt: sec(2025, 9, 1), lifespanMonths: 6 }, // ~Apr 2026, soon
  ]

  it('surfaces only things in (or past) their lead window', () => {
    const soon = carnetLifeSoon(items, now)
    const ids = soon.map((s) => s.carnetId)
    expect(ids).toContain('a')
    expect(ids).toContain('c')
    expect(ids).not.toContain('b') // a brand-new long-lived thing stays quiet
  })

  it('marks an overdue thing with a non-positive monthsLeft, a near one positive', () => {
    const soon = carnetLifeSoon(items, now)
    const a = soon.find((s) => s.carnetId === 'a')!
    const c = soon.find((s) => s.carnetId === 'c')!
    expect(a.monthsLeft).toBeLessThanOrEqual(0)
    expect(c.monthsLeft).toBeGreaterThan(0)
  })

  it('sorts soonest-first', () => {
    const soon = carnetLifeSoon(items, now)
    for (let i = 1; i < soon.length; i++) expect(soon[i].at).toBeGreaterThanOrEqual(soon[i - 1].at)
  })

  it('ignores items without an install date or lifespan', () => {
    const soon = carnetLifeSoon(
      [{ carnetId: 'x', name: 'Sans date', kind: 'thing', color: null, installedAt: 0, lifespanMonths: 0 }],
      now,
    )
    expect(soon).toHaveLength(0)
  })
})
