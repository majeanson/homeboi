import { describe, it, expect } from 'vitest'
import { birthdayOccurrences, type BirthdayPerson } from './birthdays'
import { birthdayOrNull } from './birthdayRule'
import { localDayStart } from './ids'

// LOCAL-midnight (America/Toronto) of a calendar date — the day boundary the engine
// emits at. Noon UTC is safely inside that civil date in any North-American zone.
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))

const lea: BirthdayPerson = { key: 'member:lea', name: 'Léa', birthday: '2020-06-24', memberId: 'lea' }
const noYear: BirthdayPerson = { key: 'contact:gp', name: 'Mémé', birthday: '0000-03-12', memberId: null }

describe('birthdayOccurrences', () => {
  it('emits the birthday at local midnight of the day, with the age turned', () => {
    const occ = birthdayOccurrences([lea], d(2026, 5, 1), d(2026, 6, 1)) // June 2026 window
    expect(occ).toHaveLength(1)
    expect(occ[0].at).toBe(d(2026, 5, 24)) // June 24
    expect(occ[0].age).toBe(6) // 2026 − 2020
    expect(occ[0].memberId).toBe('lea')
    expect(occ[0].id).toBe('birthday:member:lea:2026')
  })

  it('omits the age when the birth year is unknown (0000)', () => {
    const occ = birthdayOccurrences([noYear], d(2026, 2, 1), d(2026, 3, 1)) // March window
    expect(occ).toHaveLength(1)
    expect(occ[0].at).toBe(d(2026, 2, 12))
    expect(occ[0].age).toBeNull()
  })

  it('does not emit a birthday outside the window', () => {
    expect(birthdayOccurrences([lea], d(2026, 0, 1), d(2026, 1, 1))).toHaveLength(0) // January
  })

  it('emits across a Dec→Jan window edge (two calendar years scanned)', () => {
    const ny: BirthdayPerson = { key: 'member:ny', name: 'Jan', birthday: '1990-01-02', memberId: 'ny' }
    const occ = birthdayOccurrences([ny], d(2026, 11, 28), d(2027, 0, 5)) // Dec 28 → Jan 5
    expect(occ).toHaveLength(1)
    expect(occ[0].at).toBe(d(2027, 0, 2)) // Jan 2, 2027
    expect(occ[0].age).toBe(37)
  })

  it('a Feb-29 birthday only lands in a leap year (no rollover to Mar 1)', () => {
    const leapBaby: BirthdayPerson = { key: 'member:lb', name: 'Bissex', birthday: '2024-02-29', memberId: 'lb' }
    // 2027 is NOT a leap year → no occurrence in a late-Feb window.
    expect(birthdayOccurrences([leapBaby], d(2027, 1, 25), d(2027, 2, 3))).toHaveLength(0)
    // 2028 IS a leap year → it lands on Feb 29.
    const occ = birthdayOccurrences([leapBaby], d(2028, 1, 25), d(2028, 2, 3))
    expect(occ).toHaveLength(1)
    expect(occ[0].at).toBe(d(2028, 1, 29))
  })

  it('sorts multiple people ascending by date', () => {
    const occ = birthdayOccurrences([lea, { key: 'member:x', name: 'X', birthday: '2000-06-10', memberId: 'x' }], d(2026, 5, 1), d(2026, 6, 1))
    expect(occ.map((o) => o.name)).toEqual(['X', 'Léa']) // June 10 before June 24
  })

  it('ignores malformed birthdays', () => {
    const bad: BirthdayPerson = { key: 'member:b', name: 'B', birthday: 'not-a-date', memberId: 'b' }
    expect(birthdayOccurrences([bad], d(2026, 0, 1), d(2027, 0, 1))).toHaveLength(0)
  })
})

// ---- The write side of the two-tree birthday rule ---------------------------
//
// The client↔server AGREEMENT table lives in `src/lib/cercle.test.ts`, not here:
// a test in this tree may not import `src/`, because `src/lib/cercle.ts` pulls a
// type from `guideContent`, which reaches a `.tsx`, which the Worker's tsconfig
// has no `--jsx` for. `cercle.test.ts` already imports server code for the same
// kind of pin (the relationship INVERSES map), so that is the proven direction.
describe('a short year reaches the derivation (the board/cercle split)', () => {
  // Found 2026-08-28: this file's parser matched `\d{4}` where the client copy and
  // BOTH write validators matched `\d{1,4}`, so a stored 1–3-digit year rendered on
  // the cercle page and was silently dropped from the board's agenda.
  it('derives an occurrence for a 1-digit year instead of skipping it', () => {
    const occ = birthdayOccurrences([{ key: 'contact:old', name: 'Aïeul', birthday: '1-03-12', memberId: null }], d(2026, 2, 1), d(2026, 3, 1))
    expect(occ).toHaveLength(1)
    expect(occ[0].at).toBe(d(2026, 2, 12))
  })
})

describe('birthdayOrNull — the one write validator', () => {
  it('normalizes the year to four digits, so new rows are canonical', () => {
    expect(birthdayOrNull('1-03-12')).toBe('0001-03-12')
    expect(birthdayOrNull('99-03-12')).toBe('0099-03-12')
    expect(birthdayOrNull('0-03-12')).toBe('0000-03-12') // year unknown, canonically spelled
    expect(birthdayOrNull('  2020-06-24  ')).toBe('2020-06-24')
  })

  it('refuses anything the readers could not parse', () => {
    // The point of routing the validator through parseBirthday: "accepted" and
    // "readable" cannot drift apart. Month 13 used to be stored and then ignored.
    for (const bad of ['2020-13-01', '2020-06-32', 'not-a-date', '', '2020-6-4', 42, null, undefined, {}]) {
      expect(birthdayOrNull(bad), String(bad)).toBeNull()
    }
  })
})
