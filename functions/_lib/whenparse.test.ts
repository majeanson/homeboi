import { describe, it, expect } from 'vitest'
import { parseWhen } from './whenparse'

// Fixed "now": Wednesday 2026-06-03 12:00 UTC (= 08:00 in America/Toronto, EDT).
// Deterministic so weekday math is stable regardless of when the test runs.
const NOW = Date.UTC(2026, 5, 3, 12, 0, 0)

// parseWhen now resolves to HOUSEHOLD-LOCAL wall time (America/Toronto), the same
// model recur.ts / month.ts use — so assert against the Toronto wall clock, not
// getUTC* (which would read the 4–5 h-shifted instant).
const TZ = 'America/Toronto'
function wall(at: number) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const p = Object.fromEntries(f.formatToParts(new Date(at * 1000)).map((x) => [x.type, x.value])) as Record<
    string,
    string
  >
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, dow }
}

describe('parseWhen', () => {
  it('falls back to today/all-day on empty input', () => {
    const r = parseWhen(undefined, NOW)
    expect(r.allDay).toBe(true)
  })

  it('reads a weekday + 24h time in local wall time', () => {
    const r = parseWhen('mardi 15h', NOW)
    expect(r.allDay).toBe(false)
    const d = wall(r.startAt)
    expect(d.dow).toBe(2) // Tuesday
    expect(d.h).toBe(15) // 3 PM LOCAL, not 11 AM (the old UTC bug)
  })

  it('reads "demain" as the next local day', () => {
    const r = parseWhen('demain', NOW)
    const d = wall(r.startAt)
    expect(d.d).toBe(4) // 3rd + 1
  })

  it('reads am/pm in local wall time', () => {
    const r = parseWhen('thursday 3pm', NOW)
    const d = wall(r.startAt)
    expect(d.dow).toBe(4)
    expect(d.h).toBe(15)
  })

  it('same-weekday means next week, not today', () => {
    // NOW is Wednesday; "mercredi" should land 7 days out, not now.
    const r = parseWhen('mercredi 9h', NOW)
    const d = wall(r.startAt)
    expect(d.d).toBe(10)
    expect(d.h).toBe(9)
  })

  it('reads "après-demain" as +2 (and not "demain")', () => {
    const r = parseWhen('après-demain', NOW)
    const d = wall(r.startAt)
    expect(d.d).toBe(5) // 3rd + 2
  })

  it('reads an explicit month-name date with a day, time stripped first', () => {
    const r = parseWhen('20 juin 15h', NOW)
    const d = wall(r.startAt)
    expect(d.mo).toBe(6) // June (1-based in the formatter)
    expect(d.d).toBe(20)
    expect(d.h).toBe(15)
    expect(r.allDay).toBe(false)
  })

  it('reads an English month-name date', () => {
    const r = parseWhen('june 20', NOW)
    const d = wall(r.startAt)
    expect(d.mo).toBe(6)
    expect(d.d).toBe(20)
  })

  it('rolls a past month-name date to next year', () => {
    // NOW is June 3; "20 janvier" means next January, not this past one.
    const r = parseWhen('20 janvier', NOW)
    const d = wall(r.startAt)
    expect(d.y).toBe(2027)
    expect(d.mo).toBe(1) // January
  })

  it('reads "le 20" as this month when still upcoming', () => {
    const r = parseWhen('le 20', NOW)
    const d = wall(r.startAt)
    expect(d.mo).toBe(6) // still June (NOW is the 3rd)
    expect(d.d).toBe(20)
  })

  it('an all-day date lands on local midnight, bucketing on the right day', () => {
    // The board buckets by localDayStart; an all-day "demain" must BE that local
    // midnight so it lands on the 4th, not slip to the 3rd/5th via a UTC offset.
    const r = parseWhen('demain', NOW)
    const d = wall(r.startAt)
    expect(r.allDay).toBe(true)
    expect(d.h).toBe(0)
    expect(d.d).toBe(4)
  })

  it('does NOT read a month inside another word ("semaine" → no May)', () => {
    const r = parseWhen('semaine', NOW)
    // No real day → falls back to today/all-day, never May.
    expect(r.allDay).toBe(true)
  })

  it('nudges "à soir" to the local evening', () => {
    const r = parseWhen('à soir', NOW)
    const d = wall(r.startAt)
    expect(d.h).toBe(18)
    expect(r.allDay).toBe(false)
  })

  it('applies a bare time to today, in local wall time', () => {
    const r = parseWhen('18h', NOW)
    const d = wall(r.startAt)
    expect(r.allDay).toBe(false)
    expect(d.d).toBe(3) // today
    expect(d.h).toBe(18)
  })
})
