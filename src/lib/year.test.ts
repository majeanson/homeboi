import { describe, it, expect } from 'vitest'
import {
  easter,
  HOLIDAYS,
  holidayDaySec,
  holidaysOnDay,
  holidaysInRange,
  ageAt,
  groupByYear,
  groupByMonth,
  yearPoints,
  schoolDayKind,
  type SchoolYear,
} from './year'
import { localDayStart, addLocalDays } from './localDay'

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

  it('groupByYear labels years only once a second year exists', () => {
    const sec = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d).getTime() / 1000)
    const rows = [
      { id: 'a', at: sec(2026, 5, 1) },
      { id: 'b', at: sec(2026, 2, 1) },
    ]
    // One year → a single calm unlabelled group (no heading noise).
    expect(groupByYear(rows, (r) => r.at)).toEqual([[null, rows]])
    // A second year appears → newest year first, each labelled.
    const more = [...rows, { id: 'c', at: sec(2025, 12, 25) }]
    const groups = groupByYear(more, (r) => r.at)
    expect(groups.map(([y]) => y)).toEqual([2026, 2025])
    expect(groups[1][1].map((r) => r.id)).toEqual(['c'])
    expect(groupByYear([], (r: { at: number }) => r.at)).toEqual([])
  })

  it('yearPoints merges household fixed points + derived fêtes, sorted by day', () => {
    const sec = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d).getTime() / 1000)
    const from = sec(2026, 7, 1)
    const to = sec(2027, 7, 1)
    const pts = yearPoints(
      {
        birthdays: [{ id: 'b1', name: 'Léa', day: sec(2026, 9, 4), age: 4, memberId: 'm3' }],
        events: [{ id: 'e1', title: 'Anniversaire de mariage', day: sec(2026, 8, 15) }],
        upkeep: [{ id: 'u1', kind: 'upkeep', title: 'Pneus d’hiver', color: null, day: sec(2026, 10, 15) }],
        life: [{ carnetId: 'c1', name: 'Chauffe-eau', color: null, day: sec(2027, 3, 2) }],
      },
      { lang: 'fr', holidays: true, from, to },
    )
    // Sorted ascending, fêtes present (Canada Day excluded — before the window? no:
    // July 1 IS the window start), and every household point included once.
    expect(pts.every((p, i, xs) => i === 0 || xs[i - 1].day <= p.day)).toBe(true)
    expect(pts.find((p) => p.kind === 'fete' && p.label === 'Fête du Canada')?.day).toBe(sec(2026, 7, 1))
    expect(pts.find((p) => p.kind === 'fete' && p.label === 'Noël')?.day).toBe(sec(2026, 12, 25))
    expect(pts.filter((p) => p.kind === 'birthday')).toHaveLength(1)
    expect(pts.find((p) => p.kind === 'life')?.label).toBe('Chauffe-eau')
    // Holidays off → only the household's own points remain.
    const noFetes = yearPoints({ birthdays: [], events: [], upkeep: [], life: [] }, { lang: 'fr', holidays: false, from, to })
    expect(noFetes).toEqual([])
  })

  it('groupByMonth buckets by local month, newest first, keyed by first-of-month', () => {
    const sec = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d).getTime() / 1000)
    const rows = [
      { id: 'a', at: sec(2026, 7, 8) },
      { id: 'b', at: sec(2026, 7, 1) },
      { id: 'c', at: sec(2026, 5, 30) },
      { id: 'd', at: sec(2025, 12, 31) }, // year boundary stays its own month
    ]
    const groups = groupByMonth(rows, (r) => r.at)
    expect(groups.map(([k]) => k)).toEqual([sec(2026, 7, 1), sec(2026, 5, 1), sec(2025, 12, 1)])
    // Input order is preserved inside a month (caller pre-sorts the merged list).
    expect(groups[0][1].map((r) => r.id)).toEqual(['a', 'b'])
    expect(groupByMonth([], (r: { at: number }) => r.at)).toEqual([])
  })

  it('ageAt gives full years only when the birth YEAR is known', () => {
    const at = Math.floor(new Date(2026, 6, 8).getTime() / 1000) // 2026-07-08
    expect(ageAt('2022-03-15', at)).toBe(4)
    expect(ageAt('2022-09-01', at)).toBe(3) // birthday not reached yet this year
    expect(ageAt('2022-07-08', at)).toBe(4) // birthday IS today
    expect(ageAt('03-15', at)).toBeNull() // year-less → never guess
    expect(ageAt('--03-15', at)).toBeNull()
    expect(ageAt(null, at)).toBeNull()
    expect(ageAt('2030-01-01', at)).toBeNull() // born "in the future" → nonsense, null
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

// D-17 (bmad/10) « La rentrée » — schoolDayKind is DECIDED to be silent (null)
// except at the interesting edges (rentrée, dernier jour, relâche edges, in-term
// fériés) so summer/weekends never become wallpaper. Every daySec here is
// LOCAL-midnight America/Toronto (localDay.ts), matching how boardModel.ts feeds
// it (tomorrowDay = addLocalDays(dayNow, 1)) — NOT the runtime-local `day()`
// helper the fêtes tests above use.
describe('schoolDayKind (D-17)', () => {
  const TZ = 'America/Toronto'
  const local = (iso: string) => localDayStart(new Date(iso), TZ)

  // A school year spanning two DST changes (fall-back Nov 1 2026, spring-forward
  // Mar 8 2026 already happened before this year starts) with ONE relâche the
  // first week of March 2027 (no DST crossing there — March 2027's 2nd Sunday
  // is the 14th) and a Thanksgiving (in-term férié) inside the fall term.
  const sy: SchoolYear = {
    firstDay: local('2026-08-31T12:00:00Z'), // Mon — la rentrée
    lastDay: local('2027-06-25T12:00:00Z'), // Fri — le dernier jour
    breaks: [{ from: local('2027-03-01T12:00:00Z'), to: local('2027-03-05T12:00:00Z'), label: 'Relâche' }],
  }

  it('is null on weekends, even inside the term', () => {
    const sat = local('2026-09-12T12:00:00Z') // Sat, in term, ordinary week
    expect(schoolDayKind(sat, sy, true)).toBeNull()
  })

  it('is null when the school year is unset', () => {
    expect(schoolDayKind(local('2026-09-15T12:00:00Z'), null, true)).toBeNull()
  })

  it('flags rentrée and dernier jour as school days', () => {
    expect(schoolDayKind(sy.firstDay, sy, true)).toBe('school')
    expect(schoolDayKind(sy.lastDay, sy, true)).toBe('school')
  })

  it('is null before firstDay and after lastDay (summer stays silent, not "🏖️ every day")', () => {
    expect(schoolDayKind(local('2026-08-10T12:00:00Z'), sy, true)).toBeNull() // before bounds
    expect(schoolDayKind(local('2027-07-06T12:00:00Z'), sy, true)).toBeNull() // after bounds
  })

  it('is null (silent) on an ordinary in-term school day, not near any edge', () => {
    // A plain Wednesday in November, far from any break/férié/bound — no reason
    // for the board to speak (this is the "not wallpaper" guarantee).
    expect(schoolDayKind(local('2026-11-04T12:00:00Z'), sy, true)).toBeNull()
  })

  it('flags a relâche STARTING as congé, stays silent deep inside it, and flags the return as school', () => {
    expect(schoolDayKind(sy.breaks[0]!.from, sy, true)).toBe('conge') // Mon Mar 1 2027
    const midBreak = addLocalDays(sy.breaks[0]!.from, 2, TZ) // Wed Mar 3 2027
    expect(schoolDayKind(midBreak, sy, true)).toBeNull()
    const backToSchool = addLocalDays(sy.breaks[0]!.to, 3, TZ) // Fri Mar 5 → Mon Mar 8 2027
    expect(schoolDayKind(backToSchool, sy, true)).toBe('school')
  })

  it('flags an in-term férié as congé, but only when holidaysOn is true', () => {
    // Action de grâce 2026 (2nd Monday of October) falls inside the fall term.
    const thanksgiving = local('2026-10-12T12:00:00Z')
    expect(holidaysOnDay(thanksgiving).map((h) => h.id)).toContain('action-de-grace')
    expect(schoolDayKind(thanksgiving, sy, true)).toBe('conge')
    expect(schoolDayKind(thanksgiving, sy, false)).toBeNull() // household opted out of fêtes
  })

  it('walks the DST spring-forward boundary correctly (23h day) when returning from a break', () => {
    // A break ending the Friday right before the Mar 8 2026 DST changeover — the
    // household returns to school the FOLLOWING Monday. addLocalDays must step the
    // short 23h Sunday correctly for the walk-back to land on the right weekday.
    const dstSy: SchoolYear = {
      firstDay: local('2025-08-25T12:00:00Z'),
      lastDay: local('2026-06-26T12:00:00Z'),
      breaks: [{ from: local('2026-03-02T12:00:00Z'), to: local('2026-03-06T12:00:00Z') }], // Mon–Fri
    }
    const monAfterDst = local('2026-03-09T12:00:00Z') // Mon, after the Mar 8 DST Sunday
    expect(schoolDayKind(monAfterDst, dstSy, true)).toBe('school')
    // The DST Sunday itself is a weekend — silent regardless.
    expect(schoolDayKind(local('2026-03-08T12:00:00Z'), dstSy, true)).toBeNull()
  })
})
