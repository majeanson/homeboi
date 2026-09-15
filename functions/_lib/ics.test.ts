import { describe, expect, it } from 'vitest'
import { parseIcs } from './ics'

// The ICS parser is the one place in this feature where being subtly wrong is
// invisible: a dropped EXDATE or a mis-expanded RRULE puts an event on a wall tablet
// on a day it does not happen, and nothing downstream can tell. So the rules are
// pinned here rather than trusted.

const D = 86_400
/** Local midnight of a Y-M-D, the anchor the parser uses for all-day values. */
const localDay = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d).getTime() / 1000)
/** A local wall-clock instant. */
const localAt = (y: number, m: number, d: number, h: number, mi = 0) =>
  Math.floor(new Date(y, m - 1, d, h, mi).getTime() / 1000)

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`
const WINDOW = { from: localDay(2026, 9, 1), to: localDay(2026, 12, 1) }
const run = (body: string, w = WINDOW) => parseIcs(wrap(body), w.from, w.to)

describe('the basics', () => {
  it('reads a single timed event', () => {
    const r = run(
      'BEGIN:VEVENT\r\nUID:a@x\r\nSUMMARY:Rendez-vous dentiste\r\nDTSTART:20260915T090000\r\nDTEND:20260915T100000\r\nEND:VEVENT',
    )
    expect(r.occurrences).toHaveLength(1)
    expect(r.occurrences[0]).toMatchObject({
      uid: 'a@x',
      title: 'Rendez-vous dentiste',
      startAt: localAt(2026, 9, 15, 9),
      endAt: localAt(2026, 9, 15, 10),
      allDay: false,
    })
  })

  it('a DATE value is all-day, anchored on LOCAL midnight and one day long', () => {
    // Local midnight, not UTC: every other all-day row in this app (meals, day notes)
    // uses localDayStart, and a UTC anchor would put a Québec household's « journée
    // pédagogique » on the wrong square for four hours of every day.
    const r = run('BEGIN:VEVENT\r\nUID:b@x\r\nSUMMARY:Journée pédagogique\r\nDTSTART;VALUE=DATE:20260918\r\nEND:VEVENT')
    expect(r.occurrences[0]).toMatchObject({ startAt: localDay(2026, 9, 18), allDay: true })
    expect(r.occurrences[0].endAt).toBe(localDay(2026, 9, 18) + D)
  })

  it('a Z time is absolute, not local', () => {
    const r = run('BEGIN:VEVENT\r\nUID:c@x\r\nSUMMARY:Call\r\nDTSTART:20260915T130000Z\r\nEND:VEVENT')
    expect(r.occurrences[0].startAt).toBe(Math.floor(Date.UTC(2026, 8, 15, 13, 0, 0) / 1000))
  })

  it('unfolds continuation lines rather than truncating the title', () => {
    // A long SUMMARY is folded at 75 octets by every real generator. Getting this
    // wrong does not throw — it silently shortens every long title in the feed.
    const r = run('BEGIN:VEVENT\r\nUID:d@x\r\nSUMMARY:Sortie au musée des\r\n  beaux-arts\r\nDTSTART;VALUE=DATE:20260920\r\nEND:VEVENT')
    expect(r.occurrences[0].title).toBe('Sortie au musée des beaux-arts')
  })

  it('unescapes the text escapes and drops an event with no title', () => {
    const r = run('BEGIN:VEVENT\r\nUID:e@x\r\nSUMMARY:Réunion\\, salle 3\r\nDTSTART;VALUE=DATE:20260921\r\nEND:VEVENT')
    expect(r.occurrences[0].title).toBe('Réunion, salle 3')
    expect(run('BEGIN:VEVENT\r\nUID:f@x\r\nDTSTART;VALUE=DATE:20260921\r\nEND:VEVENT').occurrences).toHaveLength(0)
  })

  it('keeps only what falls inside the window', () => {
    const r = run('BEGIN:VEVENT\r\nUID:g@x\r\nSUMMARY:Vieux\r\nDTSTART;VALUE=DATE:20250101\r\nEND:VEVENT')
    expect(r.occurrences).toHaveLength(0)
  })
})

describe('recurrence', () => {
  it('expands a weekly rule across the window', () => {
    const r = run('BEGIN:VEVENT\r\nUID:h@x\r\nSUMMARY:Soccer\r\nDTSTART:20260901T173000\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT')
    expect(r.occurrences.length).toBeGreaterThan(10)
    // Every occurrence lands on the same weekday and the same wall clock — the DST
    // check: 1 Sept and 30 Nov are on opposite sides of the change.
    for (const o of r.occurrences) {
      const d = new Date(o.startAt * 1000)
      expect(d.getDay()).toBe(new Date(localAt(2026, 9, 1, 17, 30) * 1000).getDay())
      expect(d.getHours()).toBe(17)
      expect(d.getMinutes()).toBe(30)
    }
  })

  it('WEEKLY;BYDAY fires on EVERY listed day, not just the start’s', () => {
    // The trap: stepping the start alone gives « every Tuesday » for a rule that says
    // « Tuesday and Thursday », and half the season quietly disappears.
    const r = run(
      'BEGIN:VEVENT\r\nUID:i@x\r\nSUMMARY:Entraînement\r\nDTSTART:20260901T180000\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH\r\nEND:VEVENT',
      { from: localDay(2026, 9, 1), to: localDay(2026, 9, 15) },
    )
    const days = new Set(r.occurrences.map((o) => new Date(o.startAt * 1000).getDay()))
    expect([...days].sort()).toEqual([2, 4])
    expect(r.occurrences.length).toBe(4)
  })

  it('honours INTERVAL, COUNT and UNTIL', () => {
    const every2 = run('BEGIN:VEVENT\r\nUID:j@x\r\nSUMMARY:Paie\r\nDTSTART;VALUE=DATE:20260903\r\nRRULE:FREQ=WEEKLY;INTERVAL=2\r\nEND:VEVENT')
    // Measured in LOCAL DAYS, not seconds — and this assertion started life as
    // `toBe(14 * D)` and failed by exactly 3600. It was the test that was wrong: this
    // window spans the DST change, so two local midnights fourteen days apart are
    // 14×86400 ± one hour apart in unix seconds. Preserving the local midnight is the
    // correct behaviour (it is why `step` uses setDate rather than arithmetic), and
    // the fixed-86400 assertion is the exact trap CLAUDE.md warns about — caught here
    // by a window chosen to cross the boundary.
    for (let k = 1; k < every2.occurrences.length; k++) {
      const a = new Date(every2.occurrences[k - 1].startAt * 1000)
      const b = new Date(every2.occurrences[k].startAt * 1000)
      expect(b.getHours()).toBe(0)
      expect(Math.round((b.getTime() - a.getTime()) / (D * 1000))).toBe(14)
    }
    const counted = run('BEGIN:VEVENT\r\nUID:k@x\r\nSUMMARY:Cours\r\nDTSTART;VALUE=DATE:20260903\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT')
    expect(counted.occurrences).toHaveLength(3)
    const until = run('BEGIN:VEVENT\r\nUID:l@x\r\nSUMMARY:Cours\r\nDTSTART;VALUE=DATE:20260903\r\nRRULE:FREQ=WEEKLY;UNTIL=20260917\r\nEND:VEVENT')
    expect(until.occurrences).toHaveLength(3)
  })

  it('EXDATE removes exactly the excluded occurrence', () => {
    const r = run(
      'BEGIN:VEVENT\r\nUID:m@x\r\nSUMMARY:Cours\r\nDTSTART;VALUE=DATE:20260903\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE;VALUE=DATE:20260910\r\nEND:VEVENT',
    )
    expect(r.occurrences.map((o) => o.startAt)).toEqual([localDay(2026, 9, 3), localDay(2026, 9, 17)])
  })

  it('STATUS:CANCELLED drops the event entirely', () => {
    const r = run('BEGIN:VEVENT\r\nUID:n@x\r\nSUMMARY:Annulé\r\nSTATUS:CANCELLED\r\nDTSTART;VALUE=DATE:20260905\r\nEND:VEVENT')
    expect(r.occurrences).toHaveLength(0)
  })

  it('a RECURRENCE-ID override replaces its occurrence instead of doubling it', () => {
    // The school moves ONE week's class. Without the override map the day shows both
    // the original and the replacement — which is worse than showing neither.
    const r = run(
      'BEGIN:VEVENT\r\nUID:o@x\r\nSUMMARY:Cours\r\nDTSTART;VALUE=DATE:20260903\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nUID:o@x\r\nRECURRENCE-ID;VALUE=DATE:20260910\r\nSUMMARY:Cours (salle 4)\r\nDTSTART;VALUE=DATE:20260911\r\nEND:VEVENT',
    )
    const starts = r.occurrences.map((o) => o.startAt)
    expect(starts).toContain(localDay(2026, 9, 11)) // the moved one
    expect(starts).not.toContain(localDay(2026, 9, 10)) // …and not the original
    expect(starts).toHaveLength(3)
  })
})

describe('honesty about what it cannot do', () => {
  it('counts an unsupported rule as PARTIAL and still shows its first day', () => {
    // « the second Tuesday of the month » is BYSETPOS territory. The rule is not
    // implemented — but the event exists, so it appears once, on the day it starts,
    // and the feed reports that it is not fully expanded. Silence here is the failure
    // mode: a calendar that LOOKS complete and is not.
    const r = run(
      'BEGIN:VEVENT\r\nUID:p@x\r\nSUMMARY:Conseil d’établissement\r\nDTSTART;VALUE=DATE:20260908\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU\r\nEND:VEVENT',
    )
    expect(r.partial).toBe(1)
    expect(r.occurrences).toHaveLength(1)
    expect(r.occurrences[0].startAt).toBe(localDay(2026, 9, 8))
  })

  it('a malformed document yields nothing rather than throwing', () => {
    // A feed that 200s with an HTML error page is the common real-world failure; it
    // must not take the whole nightly refresh down with it.
    expect(() => parseIcs('<html>not a calendar</html>', WINDOW.from, WINDOW.to)).not.toThrow()
    expect(parseIcs('<html>nope</html>', WINDOW.from, WINDOW.to).occurrences).toHaveLength(0)
    expect(parseIcs('', WINDOW.from, WINDOW.to).occurrences).toHaveLength(0)
  })

  it('caps a runaway feed instead of expanding for ever', () => {
    const r = run('BEGIN:VEVENT\r\nUID:q@x\r\nSUMMARY:Minuterie\r\nDTSTART:20260901T000000\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT')
    expect(r.occurrences.length).toBeLessThanOrEqual(400)
  })
})
