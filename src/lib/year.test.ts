import { describe, it, expect } from 'vitest'
import { easter, HOLIDAYS, holidayDaySec, holidaysOnDay, holidaysInRange } from './year'

// D-16 (bmad/09) — the derived-year layer. The moving feasts are the risky
// part: computus (Easter), the nth-weekday rules (Travail, Action de grâce,
// Mères, Pères) and the Monday-preceding-May-25 rule (Patriotes). Verified
// against known civil dates.

const byId = (id: string) => HOLIDAYS.find((h) => h.id === id)!
const dateOf = (id: string, year: number) => byId(id).date(year)

describe('easter (Gregorian computus)', () => {
  it('matches known Easter Sundays', () => {
    expect(easter(2024)).toEqual({ month: 3, day: 31 })
    expect(easter(2025)).toEqual({ month: 4, day: 20 })
    expect(easter(2026)).toEqual({ month: 4, day: 5 })
    expect(easter(2027)).toEqual({ month: 3, day: 28 })
  })
})

describe('moving feasts', () => {
  it('Vendredi saint / lundi de Pâques bracket Easter', () => {
    expect(dateOf('vendredi-saint', 2026)).toEqual({ month: 4, day: 3 })
    expect(dateOf('lundi-de-paques', 2026)).toEqual({ month: 4, day: 6 })
    // Easter 2024 is Mar 31 — Good Friday crosses the month boundary back.
    expect(dateOf('vendredi-saint', 2024)).toEqual({ month: 3, day: 29 })
    expect(dateOf('lundi-de-paques', 2024)).toEqual({ month: 4, day: 1 })
  })
  it('Patriotes = the Monday preceding May 25', () => {
    expect(dateOf('patriotes', 2026)).toEqual({ month: 5, day: 18 })
    expect(dateOf('patriotes', 2025)).toEqual({ month: 5, day: 19 })
    expect(dateOf('patriotes', 2027)).toEqual({ month: 5, day: 24 }) // May 24 IS a Monday
  })
  it('Travail = 1st Monday of September; Action de grâce = 2nd Monday of October', () => {
    expect(dateOf('travail', 2026)).toEqual({ month: 9, day: 7 })
    expect(dateOf('action-de-grace', 2026)).toEqual({ month: 10, day: 12 })
    expect(dateOf('travail', 2025)).toEqual({ month: 9, day: 1 })
    expect(dateOf('action-de-grace', 2025)).toEqual({ month: 10, day: 13 })
  })
  it('Mères = 2nd Sunday of May; Pères = 3rd Sunday of June', () => {
    expect(dateOf('meres', 2026)).toEqual({ month: 5, day: 10 })
    expect(dateOf('peres', 2026)).toEqual({ month: 6, day: 21 })
  })
})

describe('day + range lookups', () => {
  const day = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d).getTime() / 1000)

  it('holidaysOnDay finds the fixed dates (and nothing on an ordinary day)', () => {
    expect(holidaysOnDay(day(2026, 6, 24)).map((h) => h.id)).toEqual(['st-jean'])
    expect(holidaysOnDay(day(2026, 12, 25)).map((h) => h.id)).toEqual(['noel'])
    expect(holidaysOnDay(day(2026, 3, 3))).toEqual([])
  })

  it('holidayDaySec is the LOCAL midnight of the holiday', () => {
    expect(holidayDaySec(byId('canada'), 2026)).toBe(day(2026, 7, 1))
  })

  it('holidaysInRange returns the window sorted, and spans a year boundary', () => {
    const dec = holidaysInRange(day(2026, 12, 20), 20) // Dec 20 2026 → Jan 8 2027
    expect(dec.map((x) => x.holiday.id)).toEqual(['veille-de-noel', 'noel', 'veille-jour-de-lan', 'jour-de-lan'])
    expect(dec.every((x, i, xs) => i === 0 || xs[i - 1].at <= x.at)).toBe(true)
  })

  it('every holiday resolves to a real calendar date in every year (no drift)', () => {
    for (const y of [2024, 2025, 2026, 2030]) {
      for (const h of HOLIDAYS) {
        const { month, day: d } = h.date(y)
        const roundTrip = new Date(y, month - 1, d)
        expect(roundTrip.getMonth() + 1, `${h.id} ${y}`).toBe(month)
        expect(roundTrip.getDate(), `${h.id} ${y}`).toBe(d)
      }
    }
  })
})
