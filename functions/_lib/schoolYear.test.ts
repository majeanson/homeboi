import { describe, it, expect } from 'vitest'
import { cleanSchoolYear } from './schoolYear'

// The validator is the one gate between an untrusted PATCH body and what the
// board/year view render all year — a malformed year must never be stored.
describe('cleanSchoolYear', () => {
  const DAY = 86_400
  const firstDay = 1_000_000 // any positive local-midnight unix s
  const lastDay = firstDay + 280 * DAY

  it('accepts a valid firstDay/lastDay with no breaks', () => {
    expect(cleanSchoolYear({ firstDay, lastDay })).toEqual({ firstDay, lastDay, breaks: [] })
  })

  it('rejects missing/unparseable dates', () => {
    expect(cleanSchoolYear({ firstDay: 'nope', lastDay })).toBeNull()
    expect(cleanSchoolYear({ firstDay })).toBeNull()
    expect(cleanSchoolYear({})).toBeNull()
    expect(cleanSchoolYear(null)).toBeNull()
    expect(cleanSchoolYear('nope')).toBeNull()
  })

  it('rejects firstDay not strictly before lastDay', () => {
    expect(cleanSchoolYear({ firstDay: lastDay, lastDay: firstDay })).toBeNull()
    expect(cleanSchoolYear({ firstDay, lastDay: firstDay })).toBeNull() // equal
  })

  it('keeps a valid break inside the term, with an optional label', () => {
    const from = firstDay + 100 * DAY
    const to = from + 5 * DAY
    expect(cleanSchoolYear({ firstDay, lastDay, breaks: [{ from, to, label: '  Relâche  ' }] })).toEqual({
      firstDay,
      lastDay,
      breaks: [{ from, to, label: 'Relâche' }],
    })
  })

  it('drops a break outside the term bounds', () => {
    const tooEarly = { from: firstDay - 10 * DAY, to: firstDay - 5 * DAY }
    const tooLate = { from: lastDay + 5 * DAY, to: lastDay + 10 * DAY }
    expect(cleanSchoolYear({ firstDay, lastDay, breaks: [tooEarly, tooLate] })).toEqual({
      firstDay,
      lastDay,
      breaks: [],
    })
  })

  it('drops a mis-ordered break (from > to)', () => {
    const from = firstDay + 100 * DAY
    expect(cleanSchoolYear({ firstDay, lastDay, breaks: [{ from, to: from - DAY }] })).toEqual({
      firstDay,
      lastDay,
      breaks: [],
    })
  })

  it('collapses overlapping breaks down to the ones that fit, kept in order', () => {
    const a = { from: firstDay + 50 * DAY, to: firstDay + 55 * DAY }
    const b = { from: firstDay + 52 * DAY, to: firstDay + 58 * DAY } // overlaps a
    const c = { from: firstDay + 60 * DAY, to: firstDay + 62 * DAY } // fits after a
    const out = cleanSchoolYear({ firstDay, lastDay, breaks: [b, a, c] }) // unsorted input too
    expect(out!.breaks).toEqual([a, c])
  })

  it('caps breaks at 12 and never stores a bare null (empty array instead)', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ from: firstDay + i * 10 * DAY, to: firstDay + i * 10 * DAY + DAY }))
    expect(cleanSchoolYear({ firstDay, lastDay, breaks: many })!.breaks).toHaveLength(12)
    expect(cleanSchoolYear({ firstDay, lastDay })!.breaks).toEqual([])
  })
})
