import { describe, it, expect } from 'vitest'
import { effectiveAnchor, upkeepOccurrences, upkeepStatus, nextCycleDay } from './upkeep'
import { localDayStart } from './ids'

// Same convention as recur.test.ts: household-local (America/Toronto) midnights.
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))
// A completion INSTANT during a local day (10:00) — last_done_at is a timestamp,
// not a midnight, and the derivations must treat any instant of the day as done.
const doneAt = (day: number) => day + 10 * 3600

const row = (over: Partial<Parameters<typeof upkeepStatus>[0]>) => ({
  at: null as number | null,
  recur_json: null as string | null,
  last_done_at: null as number | null,
  recur_from: 'anchor' as string | null,
  ...over,
})

const MONTHLY3 = '{"freq":"monthly","interval":3}'
const YEARLY = '{"freq":"yearly"}'

describe('upkeepStatus — one-off rows', () => {
  const today = d(2026, 5, 15)
  it('undated: nothing due, ever', () => {
    expect(upkeepStatus(row({}), today)).toEqual({ nextAt: null, dueToday: false, overdueSince: null, snoozedUntil: null })
  })
  it('future: nextAt is its date, not due, not overdue', () => {
    const at = d(2026, 5, 20)
    expect(upkeepStatus(row({ at }), today)).toEqual({ nextAt: at, dueToday: false, overdueSince: null, snoozedUntil: null })
  })
  it('today: dueToday', () => {
    expect(upkeepStatus(row({ at: today }), today)).toEqual({ nextAt: today, dueToday: true, overdueSince: null, snoozedUntil: null })
  })
  it('past + unchecked: carries forward as overdue (nextAt stays its own date)', () => {
    const at = d(2026, 5, 1)
    expect(upkeepStatus(row({ at }), today)).toEqual({ nextAt: at, dueToday: false, overdueSince: at, snoozedUntil: null })
  })
  it('past + checked: settled — no overdue, not due', () => {
    const at = d(2026, 5, 1)
    const st = upkeepStatus(row({ at, last_done_at: doneAt(d(2026, 5, 3)) }), today)
    expect(st.dueToday).toBe(false)
    expect(st.overdueSince).toBeNull()
  })
})

describe('upkeepStatus — recurring, anchor grid (the default)', () => {
  // Every 3 months anchored Mar 5 → due Mar 5 / Jun 5 / Sep 5 / Dec 5.
  const anchor = d(2026, 2, 5)
  const base = row({ at: anchor, recur_json: MONTHLY3 })
  it('due on an occurrence day (a never-done row also still owes the prior cycle)', () => {
    const st = upkeepStatus(base, d(2026, 5, 5))
    expect(st.dueToday).toBe(true)
    // Both facts are reported; the board renders only the due-today row (checking
    // it stamps last_done_at, which covers the missed Mar 5 too).
    expect(st.overdueSince).toBe(d(2026, 2, 5))
  })
  it('done today suppresses dueToday, and nextAt moves to the next cycle', () => {
    const today = d(2026, 5, 5)
    const st = upkeepStatus({ ...base, last_done_at: doneAt(today) }, today)
    expect(st.dueToday).toBe(false)
    expect(st.overdueSince).toBeNull()
    expect(st.nextAt).toBe(d(2026, 8, 5)) // not today — today's occurrence is settled
  })
  it('missed occurrence carries forward until checked', () => {
    // Jun 5 passed unchecked (last done on the Mar 5 cycle).
    const st = upkeepStatus({ ...base, last_done_at: doneAt(d(2026, 2, 5)) }, d(2026, 5, 10))
    expect(st.overdueSince).toBe(d(2026, 5, 5))
    expect(st.dueToday).toBe(false)
    expect(st.nextAt).toBe(d(2026, 8, 5)) // the grid keeps ticking
  })
  it('two missed cycles report the MOST RECENT due date only', () => {
    const st = upkeepStatus({ ...base, last_done_at: doneAt(d(2026, 2, 5)) }, d(2026, 8, 10))
    expect(st.overdueSince).toBe(d(2026, 8, 5))
  })
  it('a late completion clears the miss (done on/after the due day covers it)', () => {
    const st = upkeepStatus({ ...base, last_done_at: doneAt(d(2026, 5, 20)) }, d(2026, 6, 1))
    expect(st.overdueSince).toBeNull()
  })
  it('overdue never looks back past the lookback bound (~2 years)', () => {
    // Yearly anchored 2020, never done, today mid-2026 with the last due >2y back?
    // Yearly always has a due within 2 years, so use interval 5: due 2020 / 2025.
    const st = upkeepStatus(row({ at: d(2020, 2, 5), recur_json: '{"freq":"yearly","interval":5}' }), d(2026, 5, 15))
    expect(st.overdueSince).toBe(d(2025, 2, 5)) // within the bound → found
  })
})

describe('upkeepStatus — « à partir de la dernière fois » (recur_from=done)', () => {
  const base = row({ at: d(2026, 0, 10), recur_json: MONTHLY3, recur_from: 'done' })
  it('before any completion, the anchor grid applies', () => {
    expect(effectiveAnchor(base)).toBe(d(2026, 0, 10))
    const st = upkeepStatus(base, d(2026, 0, 10))
    expect(st.dueToday).toBe(true)
  })
  it('a completion re-anchors the cycle on its own day', () => {
    // Done Feb 20 (late) → next due May 20, not Apr 10.
    const r = { ...base, last_done_at: doneAt(d(2026, 1, 20)) }
    expect(effectiveAnchor(r)).toBe(d(2026, 1, 20))
    const st = upkeepStatus(r, d(2026, 2, 1))
    expect(st.nextAt).toBe(d(2026, 4, 20))
    expect(st.dueToday).toBe(false)
    expect(st.overdueSince).toBeNull() // the completion day itself is covered
  })
  it('missing the re-anchored due date carries forward', () => {
    const r = { ...base, last_done_at: doneAt(d(2026, 1, 20)) }
    const st = upkeepStatus(r, d(2026, 5, 1)) // May 20 due, missed
    expect(st.overdueSince).toBe(d(2026, 4, 20))
  })
  it('yearly re-anchor: done in July → next July, whatever the original date', () => {
    const r = row({ at: d(2026, 2, 1), recur_json: YEARLY, recur_from: 'done', last_done_at: doneAt(d(2026, 6, 12)) })
    const st = upkeepStatus(r, d(2026, 7, 1))
    expect(st.nextAt).toBe(d(2027, 6, 12))
    expect(st.overdueSince).toBeNull()
  })
  it('nextAt right after completing today is the NEXT cycle, not today', () => {
    const today = d(2026, 3, 10)
    const r = { ...base, last_done_at: doneAt(today) }
    const st = upkeepStatus(r, today)
    expect(st.dueToday).toBe(false)
    expect(st.nextAt).toBe(d(2026, 6, 10))
  })
})

describe('upkeepOccurrences', () => {
  const from = d(2026, 0, 1)
  const to = d(2027, 0, 1)
  it('one-off in range; suppressed once done unless includeDone (a calendar cell)', () => {
    const r = row({ at: d(2026, 5, 1) })
    expect(upkeepOccurrences(r, from, to)).toEqual([d(2026, 5, 1)])
    const done = { ...r, last_done_at: doneAt(d(2026, 5, 1)) }
    expect(upkeepOccurrences(done, from, to)).toEqual([])
    expect(upkeepOccurrences(done, from, to, { includeDone: true })).toEqual([d(2026, 5, 1)])
  })
  it('recurring expands the window on the anchor grid', () => {
    const r = row({ at: d(2026, 2, 5), recur_json: MONTHLY3 })
    expect(upkeepOccurrences(r, from, to)).toEqual([d(2026, 2, 5), d(2026, 5, 5), d(2026, 8, 5), d(2026, 11, 5)])
  })
  it('done mode: pending occurrences only start after the completion day', () => {
    const r = row({ at: d(2026, 0, 10), recur_json: MONTHLY3, recur_from: 'done', last_done_at: doneAt(d(2026, 1, 20)) })
    expect(upkeepOccurrences(r, from, to)).toEqual([d(2026, 4, 20), d(2026, 7, 20), d(2026, 10, 20)])
    // A calendar keeps the completion day itself (the day it happened).
    expect(upkeepOccurrences(r, from, to, { includeDone: true })[0]).toBe(d(2026, 1, 20))
  })
  it('undated: empty', () => {
    expect(upkeepOccurrences(row({}), from, to)).toEqual([])
  })
})

describe('DST edges', () => {
  it('a fall-back day counts as one day in the overdue walk', () => {
    // Daily row anchored before fall-back (2026-11-01), never done, today Nov 3:
    // most recent miss is Nov 2 — the walk must not skip/duplicate around the 25 h day.
    const r = row({ at: d(2026, 9, 25), recur_json: '{"freq":"daily"}' })
    const st = upkeepStatus(r, d(2026, 10, 3))
    expect(st.overdueSince).toBe(d(2026, 10, 2))
    expect(st.dueToday).toBe(true)
  })
  it('spring-forward: weekly overdue lands on the true transition Sunday', () => {
    const r = row({ at: d(2026, 2, 1), recur_json: '{"freq":"weekly","weekdays":[0]}' })
    const st = upkeepStatus(r, d(2026, 2, 12)) // Thu after the Mar 8 transition Sunday
    expect(st.overdueSince).toBe(d(2026, 2, 8))
  })
})

describe('« Reporter » (snoozed_until, mig 0120)', () => {
  const anchor = d(2026, 2, 5) // monthly/3: Mar 5 / Jun 5 / Sep 5 / Dec 5
  const base = row({ at: anchor, recur_json: MONTHLY3 })
  it('an active snooze silences overdue AND dueToday, and names its return day', () => {
    // Jun 5 missed, snoozed to Jun 20; on Jun 10 the row is quiet.
    const st = upkeepStatus({ ...base, snoozed_until: d(2026, 5, 20) }, d(2026, 5, 10))
    expect(st.overdueSince).toBeNull()
    expect(st.dueToday).toBe(false)
    expect(st.snoozedUntil).toBe(d(2026, 5, 20))
  })
  it('nextAt while snoozed = the return day, or the first occurrence past it', () => {
    // Snooze past the Sep 5 occurrence → the row returns Sep 5 (the schedule wins)…
    expect(upkeepStatus({ ...base, snoozed_until: d(2026, 5, 20) }, d(2026, 5, 10)).nextAt).toBe(d(2026, 8, 5))
    // …a snoozed past ONE-OFF returns on the snooze day itself (never a stale past
    // nextAt leaking onto the season card).
    const oneOff = row({ at: d(2026, 4, 1), snoozed_until: d(2026, 5, 20) })
    expect(upkeepStatus(oneOff, d(2026, 5, 10)).nextAt).toBe(d(2026, 5, 20))
  })
  it('an expired snooze changes nothing — the owed date returns on its own', () => {
    const st = upkeepStatus({ ...base, snoozed_until: d(2026, 5, 8) }, d(2026, 5, 10))
    expect(st.snoozedUntil).toBeNull()
    expect(st.overdueSince).toBe(d(2026, 5, 5)) // back, calmly
  })
  it('the snooze-return day itself is live again (today >= snooze day)', () => {
    const st = upkeepStatus({ ...base, snoozed_until: d(2026, 5, 20) }, d(2026, 5, 20))
    expect(st.snoozedUntil).toBeNull()
    expect(st.overdueSince).toBe(d(2026, 5, 5))
  })
  it('nextCycleDay: the first occurrence strictly after today; null for a one-off', () => {
    expect(nextCycleDay(base, d(2026, 5, 5))).toBe(d(2026, 8, 5)) // due today → NEXT cycle
    expect(nextCycleDay(base, d(2026, 5, 10))).toBe(d(2026, 8, 5))
    expect(nextCycleDay(row({ at: d(2026, 5, 1) }), d(2026, 5, 10))).toBeNull()
  })
})
