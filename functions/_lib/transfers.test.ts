import { describe, it, expect } from 'vitest'
import {
  parseLines,
  parseShares,
  parseCatchup,
  linesTotal,
  planOccurrences,
  coveredSet,
  coverKey,
  dueDatesFor,
  catchupProjection,
  type PlanRow,
  type TransferRow,
} from './transfers'
import { localDayStart } from './ids'

// Same convention as recur.test.ts / upkeep.test.ts: household-local (America/
// Toronto) midnights, built from a noon-UTC instant so the wall date is unambiguous.
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))

const BIWEEKLY = '{"freq":"weekly","interval":2}'
const MONTHLY = '{"freq":"monthly"}'

const plan = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: 'p1',
  household_id: 'h1',
  title: 'Hypothèque',
  amount_cents: 81282,
  recur_json: BIWEEKLY,
  anchor_at: d(2026, 7, 13), // 13 août 2026
  shares_json: '{}',
  catchup_json: '{}',
  colour: null,
  position: 0,
  ...over,
})

const transfer = (over: Partial<TransferRow> = {}): TransferRow => ({
  id: 't1',
  member_id: 'marc',
  sent_at: d(2026, 7, 14),
  lines_json: '[]',
  memo: '',
  reference: null,
  note: null,
  created_at: 0,
  ...over,
})

describe('parseLines — tolerant, never throws', () => {
  it('reads the three kinds', () => {
    const json = JSON.stringify([
      { kind: 'plan', planId: 'p1', dueAt: 123, amountCents: 55641 },
      { kind: 'topup', amountCents: 200000 },
      { kind: 'other', label: 'Assurance', amountCents: 4500 },
    ])
    expect(parseLines(json)).toEqual([
      { kind: 'plan', planId: 'p1', dueAt: 123, amountCents: 55641 },
      { kind: 'topup', amountCents: 200000 },
      { kind: 'other', label: 'Assurance', amountCents: 4500 },
    ])
  })
  it('drops garbage instead of throwing', () => {
    expect(parseLines(null)).toEqual([])
    expect(parseLines('not json')).toEqual([])
    expect(parseLines('{"not":"an array"}')).toEqual([])
    expect(parseLines('[{"kind":"plan"},{"kind":"nope","amountCents":1},null,7]')).toEqual([])
  })
  it('refuses a negative amount — an amount sent is never a credit', () => {
    expect(parseLines('[{"kind":"topup","amountCents":-500}]')).toEqual([])
  })
  it('refuses a plan line with no due date (it could not claim coverage)', () => {
    expect(parseLines('[{"kind":"plan","planId":"p1","amountCents":100}]')).toEqual([])
  })
})

describe('parseShares / parseCatchup', () => {
  it('keeps well-formed cents only', () => {
    expect(parseShares('{"marc":55641,"camille":25641}')).toEqual({ marc: 55641, camille: 25641 })
    expect(parseShares('{"marc":"lots","camille":25641}')).toEqual({ camille: 25641 })
    expect(parseShares('[]')).toEqual({})
    expect(parseShares(null)).toEqual({})
  })
  it('the empty agreement is null, not a half-built object', () => {
    expect(parseCatchup('{}')).toBeNull()
    expect(parseCatchup('{"behindMemberId":"marc","gapCents":7200000}')).toBeNull()
  })
  it('refuses a term that ends before it starts', () => {
    const bad = JSON.stringify({ behindMemberId: 'marc', gapCents: 100, asOf: d(2026, 1, 1), termEnd: d(2025, 1, 1) })
    expect(parseCatchup(bad)).toBeNull()
  })
  it('reads a real agreement', () => {
    const good = JSON.stringify({
      behindMemberId: 'marc',
      gapCents: 7200000,
      asOf: d(2026, 1, 1),
      termEnd: d(2029, 2, 31),
    })
    expect(parseCatchup(good)).toEqual({
      behindMemberId: 'marc',
      gapCents: 7200000,
      asOf: d(2026, 1, 1),
      termEnd: d(2029, 2, 31),
    })
  })
})

describe('linesTotal', () => {
  it('sums the lines — the total is derived, never stored', () => {
    const lines = parseLines(
      JSON.stringify([
        { kind: 'plan', planId: 'p1', dueAt: 1, amountCents: 55641 },
        { kind: 'plan', planId: 'p1', dueAt: 2, amountCents: 55641 },
        { kind: 'topup', amountCents: 200000 },
      ]),
    )
    // Marc's real 14 août transfer: two mortgage dates + a 2 000 $ top-up.
    expect(linesTotal(lines)).toBe(311282)
  })
  it('is 0 for nothing', () => expect(linesTotal([])).toBe(0))
})

describe('planOccurrences', () => {
  it('biweekly lands on the anchor and every 14th local day after', () => {
    const p = plan()
    const got = planOccurrences(p, d(2026, 7, 1), d(2026, 8, 15))
    // The window closes 15 sept, so the 24 sept occurrence is correctly outside it.
    expect(got).toEqual([d(2026, 7, 13), d(2026, 7, 27), d(2026, 8, 10)])
  })

  // THE DST TRAP this codebase keeps re-learning: a fixed 86 400 step drifts an hour
  // twice a year and eventually lands on the wrong calendar day. November 1 2026 is
  // the fall-back Sunday in America/Toronto; a biweekly series anchored before it
  // must still land on local midnights after it.
  it('keeps local midnights across the fall-back weekend', () => {
    const p = plan({ anchor_at: d(2026, 9, 18) }) // 18 oct 2026
    const got = planOccurrences(p, d(2026, 9, 18), d(2026, 11, 1))
    expect(got).toEqual([d(2026, 9, 18), d(2026, 10, 1), d(2026, 10, 15), d(2026, 10, 29)])
    // Every one of them is a true local midnight, not 23:00 or 01:00 of the day before.
    for (const at of got) expect(at).toBe(localDayStart(new Date(at * 1000)))
  })

  it('keeps local midnights across the spring-forward weekend', () => {
    const p = plan({ anchor_at: d(2027, 1, 21) }) // 21 fév 2027; DST starts 14 mars 2027
    const got = planOccurrences(p, d(2027, 1, 21), d(2027, 3, 5))
    for (const at of got) expect(at).toBe(localDayStart(new Date(at * 1000)))
    expect(got).toContain(d(2027, 2, 21))
    expect(got).toContain(d(2027, 3, 4))
  })

  it('monthly holds its day-of-month across a year boundary', () => {
    const p = plan({ recur_json: MONTHLY, anchor_at: d(2026, 10, 15) }) // 15 nov 2026
    const got = planOccurrences(p, d(2026, 10, 1), d(2027, 2, 1))
    expect(got).toEqual([d(2026, 10, 15), d(2026, 11, 15), d(2027, 0, 15), d(2027, 1, 15)])
  })

  it('a plan with no rule has exactly one due date: its anchor', () => {
    const p = plan({ recur_json: null, anchor_at: d(2026, 7, 13) })
    expect(planOccurrences(p, d(2026, 7, 1), d(2026, 8, 1))).toEqual([d(2026, 7, 13)])
    expect(planOccurrences(p, d(2026, 8, 1), d(2026, 9, 1))).toEqual([])
  })

  it('a corrupt rule reads as one-off rather than crashing a surface', () => {
    const p = plan({ recur_json: '{{{' })
    expect(planOccurrences(p, d(2026, 7, 1), d(2026, 8, 1))).toEqual([d(2026, 7, 13)])
  })
})

describe('coverage', () => {
  const dueA = d(2026, 7, 13)
  const dueB = d(2026, 7, 27)
  const sent = transfer({
    lines_json: JSON.stringify([
      { kind: 'plan', planId: 'p1', dueAt: dueA, amountCents: 55641 },
      { kind: 'plan', planId: 'p1', dueAt: dueB, amountCents: 55641 },
      { kind: 'topup', amountCents: 200000 },
    ]),
  })

  it('a due date is covered per SENDER, not globally', () => {
    const set = coveredSet([sent])
    expect(set.has(coverKey('p1', dueA, 'marc'))).toBe(true)
    // Camille owes her own side of the same date; Marc paying his does not cover hers.
    expect(set.has(coverKey('p1', dueA, 'camille'))).toBe(false)
  })

  it('dueDatesFor flags exactly what this member already sent', () => {
    const got = dueDatesFor(plan(), [sent], 'marc', d(2026, 7, 1), d(2026, 8, 15))
    expect(got).toEqual([
      { at: d(2026, 7, 13), covered: true },
      { at: d(2026, 7, 27), covered: true },
      { at: d(2026, 8, 10), covered: false },
    ])
  })

  // THE REGRESSION. Marc's real rows, 2026-09-12: the two 'plan' lines were written
  // by an earlier build that resolved the due date through a UTC-midnight helper, so
  // they landed at 19 h 00 ON the due date instead of at its local midnight — same
  // Thursday, 68 400 seconds apart. Keyed on the raw second nothing matched, and the
  // app calmly re-offered two payments he had already sent 3 112,82 $ for.
  it("a line stored later in the due date's own day still covers it", () => {
    const evening = dueA + 19 * 3600 // 19 h 00 that evening, in this zone
    const legacy = transfer({
      lines_json: JSON.stringify([{ kind: 'plan', planId: 'p1', dueAt: evening, amountCents: 55641 }]),
    })
    expect(coveredSet([legacy]).has(coverKey('p1', dueA, 'marc'))).toBe(true)
    expect(dueDatesFor(plan(), [legacy], 'marc', d(2026, 7, 1), d(2026, 7, 20))).toEqual([
      { at: d(2026, 7, 13), covered: true },
    ])
  })

  it('folding to the day does not merge two different due dates', () => {
    const set = coveredSet([sent])
    expect(set.has(coverKey('p1', d(2026, 7, 14), 'marc'))).toBe(false)
  })

  it('an unattributed transfer covers only the unattributed side', () => {
    const anon = transfer({ member_id: null, lines_json: sent.lines_json })
    expect(coveredSet([anon]).has(coverKey('p1', dueA, null))).toBe(true)
    expect(coveredSet([anon]).has(coverKey('p1', dueA, 'marc'))).toBe(false)
  })
})

describe('catchupProjection', () => {
  const asOf = d(2026, 1, 1) // 1er février 2026 — when the gap was measured
  const termEnd = d(2028, 8, 1) // 1er septembre 2028
  const shares = JSON.stringify({ marc: 55641, camille: 25641 })
  const catchup = JSON.stringify({ behindMemberId: 'marc', gapCents: 7200000, asOf, termEnd })
  const p = plan({ shares_json: shares, catchup_json: catchup, anchor_at: d(2026, 1, 5) })

  it('is null without an agreement', () => {
    expect(catchupProjection(plan({ shares_json: shares }), [], d(2026, 7, 1))).toBeNull()
  })

  it('is null unless exactly two people share the payment', () => {
    const three = JSON.stringify({ marc: 30000, camille: 30000, alex: 21282 })
    expect(catchupProjection(plan({ shares_json: three, catchup_json: catchup }), [], d(2026, 7, 1))).toBeNull()
    const one = JSON.stringify({ marc: 81282 })
    expect(catchupProjection(plan({ shares_json: one, catchup_json: catchup }), [], d(2026, 7, 1))).toBeNull()
  })

  it('derives the extra per payment from the two shares — never a typed number', () => {
    const got = catchupProjection(p, [], d(2026, 7, 1))
    expect(got?.extraPerPayment).toBe(30000) // 556,41 − 256,41 = 300,00 $
    expect(got?.aheadMemberId).toBe('camille')
  })

  it('counts nothing caught up before anything is recorded', () => {
    const got = catchupProjection(p, [], d(2026, 7, 1))
    expect(got?.paymentsSoFar).toBe(0)
    expect(got?.caughtUpCents).toBe(0)
    expect(got?.remainingCents).toBe(7200000)
  })

  it('reads what was caught up off the RECORDED lines, per payment', () => {
    const sends = [
      transfer({
        id: 'a',
        lines_json: JSON.stringify([
          { kind: 'plan', planId: 'p1', dueAt: d(2026, 1, 5), amountCents: 55641 },
          { kind: 'plan', planId: 'p1', dueAt: d(2026, 1, 19), amountCents: 55641 },
        ]),
      }),
      transfer({
        id: 'b',
        lines_json: JSON.stringify([{ kind: 'plan', planId: 'p1', dueAt: d(2026, 2, 5), amountCents: 55641 }]),
      }),
    ]
    const got = catchupProjection(p, sends, d(2026, 7, 1))
    expect(got?.paymentsSoFar).toBe(3)
    expect(got?.caughtUpCents).toBe(90000) // 3 × 300 $
    expect(got?.remainingCents).toBe(7200000 - 90000)
  })

  it('a month sent at a different amount counts for exactly what it was', () => {
    const short = [
      transfer({
        lines_json: JSON.stringify([{ kind: 'plan', planId: 'p1', dueAt: d(2026, 1, 5), amountCents: 40641 }]),
      }),
    ]
    // 406,41 − 256,41 = 150,00 $ closed, not the agreed 300.
    expect(catchupProjection(p, short, d(2026, 7, 1))?.caughtUpCents).toBe(15000)
  })

  it('ignores the other person and other plans', () => {
    const noise = [
      transfer({ member_id: 'camille', lines_json: JSON.stringify([{ kind: 'plan', planId: 'p1', dueAt: d(2026, 1, 5), amountCents: 55641 }]) }),
      transfer({ lines_json: JSON.stringify([{ kind: 'plan', planId: 'other', dueAt: d(2026, 1, 5), amountCents: 55641 }]) }),
      transfer({ lines_json: JSON.stringify([{ kind: 'topup', amountCents: 500000 }]) }),
    ]
    expect(catchupProjection(p, noise, d(2026, 7, 1))?.caughtUpCents).toBe(0)
  })

  it('ignores a payment dated before the gap was measured', () => {
    const early = [
      transfer({
        lines_json: JSON.stringify([{ kind: 'plan', planId: 'p1', dueAt: d(2025, 11, 22), amountCents: 55641 }]),
      }),
    ]
    expect(catchupProjection(p, early, d(2026, 7, 1))?.paymentsSoFar).toBe(0)
  })

  it('projects the end of the term from the due dates that are actually left', () => {
    const today = d(2026, 7, 1)
    const got = catchupProjection(p, [], today)!
    // Counted, not assumed: every remaining biweekly occurrence up to the term end.
    expect(got.paymentsLeft).toBe(planOccurrences(p, d(2026, 7, 2), d(2028, 8, 2)).length)
    expect(got.projectedRemainingCents).toBe(Math.max(0, got.remainingCents - got.paymentsLeft * got.extraPerPayment))
    // The arrangement does NOT close this gap by the end of the term, and the number
    // says so plainly rather than rounding the bad news away.
    expect(got.projectedRemainingCents).toBeGreaterThan(0)
  })

  it('never reports a negative remainder — a closed gap reads as zero', () => {
    const tiny = plan({
      shares_json: shares,
      catchup_json: JSON.stringify({ behindMemberId: 'marc', gapCents: 30000, asOf, termEnd }),
      anchor_at: d(2026, 1, 5),
    })
    const sends = [
      transfer({
        lines_json: JSON.stringify([
          { kind: 'plan', planId: 'p1', dueAt: d(2026, 1, 5), amountCents: 55641 },
          { kind: 'plan', planId: 'p1', dueAt: d(2026, 1, 19), amountCents: 55641 },
        ]),
      }),
    ]
    const got = catchupProjection(tiny, sends, d(2026, 7, 1))!
    expect(got.caughtUpCents).toBe(60000)
    expect(got.remainingCents).toBe(0)
    expect(got.projectedRemainingCents).toBe(0)
  })
})
