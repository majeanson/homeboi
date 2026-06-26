import { describe, it, expect } from 'vitest'
import { season, currentSeason, nextSeasonStart, isThisSeason } from './season'

const inMonth = (m: number) => new Date(2026, m, 15, 12, 0, 0).getTime()
const sec = (d: Date) => Math.floor(d.getTime() / 1000)

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

describe('currentSeason', () => {
  it('reads the season of a given date', () => {
    expect(currentSeason(new Date(2026, 0, 15))).toBe('winter')
    expect(currentSeason(new Date(2026, 6, 15))).toBe('summer')
  })
})

describe('nextSeasonStart', () => {
  it('returns the first day of the next season', () => {
    expect(nextSeasonStart(new Date(2026, 0, 15))).toEqual(new Date(2026, 2, 1)) // winter (Jan) → Mar
    expect(nextSeasonStart(new Date(2026, 3, 15))).toEqual(new Date(2026, 5, 1)) // spring (Apr) → Jun
    expect(nextSeasonStart(new Date(2026, 7, 15))).toEqual(new Date(2026, 8, 1)) // summer (Aug) → Sep
    expect(nextSeasonStart(new Date(2026, 9, 15))).toEqual(new Date(2026, 11, 1)) // fall (Oct) → Dec
    expect(nextSeasonStart(new Date(2026, 11, 15))).toEqual(new Date(2027, 2, 1)) // Dec → next Mar
  })
})

describe('isThisSeason', () => {
  const now = new Date(2026, 0, 15) // mid-winter; season turns over Mar 1
  it('includes upkeep due before the season turns over', () => {
    expect(isThisSeason(sec(new Date(2026, 1, 10)), now)).toBe(true) // Feb — still winter
  })
  it('counts an overdue (past) one-off as still pending now', () => {
    expect(isThisSeason(sec(new Date(2026, 0, 1)), now)).toBe(true) // Jan 1, before now
  })
  it('excludes upkeep that lands in the next season', () => {
    expect(isThisSeason(sec(new Date(2026, 2, 10)), now)).toBe(false) // March — spring
  })
  it('treats an undated upkeep as never this season', () => {
    expect(isThisSeason(null, now)).toBe(false)
    expect(isThisSeason(undefined, now)).toBe(false)
  })
})
