import { describe, it, expect } from 'vitest'
import { season, currentSeason, nextSeasonStart, isThisSeason, nextSeasonAnchorDate, everySeasonAnchorDate, seasonUpkeepItems } from './season'

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

describe('nextSeasonAnchorDate / everySeasonAnchorDate (the form presets)', () => {
  it('outside the season: the next start of that season', () => {
    expect(nextSeasonAnchorDate('autumn', new Date(2026, 0, 10))).toBe('2026-09-01')
    expect(nextSeasonAnchorDate('spring', new Date(2026, 10, 10))).toBe('2027-03-01')
    expect(nextSeasonAnchorDate('winter', new Date(2026, 9, 10))).toBe('2026-12-01')
  })
  it('mid-season: today (never a back-dated anchor that reads instantly owed)', () => {
    expect(nextSeasonAnchorDate('autumn', new Date(2026, 9, 12))).toBe('2026-10-12')
    expect(nextSeasonAnchorDate('winter', new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('« chaque saison » anchors on the next season boundary', () => {
    expect(everySeasonAnchorDate(new Date(2026, 0, 10))).toBe('2026-03-01')
    expect(everySeasonAnchorDate(new Date(2026, 11, 10))).toBe('2027-03-01')
  })
})

describe('seasonUpkeepItems (the ONE « Cette saison » selection)', () => {
  const now = new Date(2026, 0, 15) // mid-winter
  const up = (o: Partial<{ kind: string; nextAt: number | null; overdueSince: number | null; recur_json: string | null; last_done_at: number | null }>) => ({
    kind: 'upkeep',
    nextAt: null,
    overdueSince: null,
    recur_json: null,
    last_done_at: null,
    ...o,
  })
  it('keeps owed + this-season rows, owed first, each by date', () => {
    const rows = [
      up({ nextAt: sec(new Date(2026, 1, 10)) }), // due Feb
      up({ overdueSince: sec(new Date(2026, 0, 5)), nextAt: sec(new Date(2026, 3, 5)), recur_json: '{"freq":"monthly","interval":3}' }), // owed
      up({ nextAt: sec(new Date(2026, 2, 10)) }), // next season — out
    ]
    const out = seasonUpkeepItems(rows, now)
    expect(out.length).toBe(2)
    expect(out[0].overdueSince).not.toBeNull() // owed leads
  })
  it('drops plans and settled one-offs', () => {
    const rows = [
      up({ kind: 'plan', nextAt: sec(new Date(2026, 1, 10)) }),
      up({ nextAt: sec(new Date(2026, 0, 1)), last_done_at: sec(new Date(2026, 0, 2)) }), // one-off, checked
    ]
    expect(seasonUpkeepItems(rows, now)).toEqual([])
  })
})
