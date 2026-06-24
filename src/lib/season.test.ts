import { describe, it, expect } from 'vitest'
import { season } from './season'

const inMonth = (m: number) => new Date(2026, m, 15, 12, 0, 0).getTime()

describe('season', () => {
  it('maps months to Québec seasons', () => {
    expect(season(inMonth(0))).toBe('winter') // Jan
    expect(season(inMonth(1))).toBe('winter') // Feb
    expect(season(inMonth(2))).toBe('spring') // Mar
    expect(season(inMonth(4))).toBe('spring') // May
    expect(season(inMonth(5))).toBe('summer') // Jun
    expect(season(inMonth(7))).toBe('summer') // Aug
    expect(season(inMonth(8))).toBe('autumn') // Sep
    expect(season(inMonth(10))).toBe('autumn') // Nov
    expect(season(inMonth(11))).toBe('winter') // Dec
  })
})
