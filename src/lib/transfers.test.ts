import { describe, it, expect } from 'vitest'
import {
  buildMemo,
  catchupSeries,
  coveredDueDates,
  extraKey,
  extrasOf,
  offeredDueDates,
  rememberedExtras,
  summariseYear,
  trackingStart,
  transferYears,
  REMEMBERED_EXTRAS,
  UPCOMING_OFFERED,
  yearOfDay,
  foldAscii,
  transferTotal,
  uncoveredDueDates,
  MEMO_CAP,
  type CatchupProjection,
  type Transfer,
  type TransferLine,
  type TransferPlan,
} from './transfers'
import { localDayStart } from './localDay'

// Household-local midnights, same convention as the server tests.
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))

const NBSP = String.fromCharCode(0x00a0)

const plan = (over: Partial<TransferPlan> = {}): TransferPlan => ({
  id: 'p1',
  title: 'Hypothèque',
  amountCents: 81282,
  recur: { freq: 'weekly', interval: 2 },
  anchorAt: d(2026, 7, 13),
  shares: { marc: 55641, camille: 25641 },
  catchup: null,
  colour: null,
  note: null,
  position: 0,
  due: [d(2026, 7, 13), d(2026, 7, 27), d(2026, 8, 10)],
  projection: null,
  ...over,
})

const transfer = (over: Partial<Transfer> = {}): Transfer => ({
  id: 't1',
  memberId: 'marc',
  sentAt: d(2026, 7, 14),
  lines: [],
  totalCents: 0,
  memo: '',
  reference: null,
  note: null,
  ...over,
})

const planLine = (dueAt: number, amountCents = 55641): TransferLine => ({
  kind: 'plan',
  planId: 'p1',
  dueAt,
  amountCents,
})

// What the app calls the old UNNAMED top-up line. The dictionary supplies it in the
// app; here it is a constant, because the point of every assertion below is that a
// legacy line and a line somebody named behave identically from there on.
const RENFLOU = 'Renflouement'

describe('transferTotal', () => {
  it('sums the lines', () => {
    expect(
      transferTotal([planLine(d(2026, 7, 13)), planLine(d(2026, 7, 27)), { kind: 'topup', amountCents: 200000 }]),
    ).toBe(311282)
  })
  it('is 0 for an empty draft', () => expect(transferTotal([])).toBe(0))
})

describe('coverage (no date math — just the recorded lines)', () => {
  const sent = transfer({ lines: [planLine(d(2026, 7, 13))] })

  it('counts only the face that sent it', () => {
    expect(coveredDueDates([sent], 'p1', 'marc').has(d(2026, 7, 13))).toBe(true)
    expect(coveredDueDates([sent], 'p1', 'camille').has(d(2026, 7, 13))).toBe(false)
  })

  it('ignores another plan', () => {
    expect(coveredDueDates([sent], 'other', 'marc').size).toBe(0)
  })

  // Re-opening a transfer must not show its OWN dates as taken by someone else.
  it('excludes the transfer being edited', () => {
    expect(coveredDueDates([sent], 'p1', 'marc', 't1').size).toBe(0)
  })

  it('uncovered = everything due up to today that nothing covers', () => {
    const today = d(2026, 7, 28)
    // 13 août already sent; 27 août not; 10 sept is still in the future.
    expect(uncoveredDueDates(plan(), [sent], 'marc', today)).toEqual([d(2026, 7, 27)])
  })

  it('offers nothing when every past date is covered', () => {
    const both = transfer({ lines: [planLine(d(2026, 7, 13)), planLine(d(2026, 7, 27))] })
    expect(uncoveredDueDates(plan(), [both], 'marc', d(2026, 7, 28))).toEqual([])
  })

  // The client half of the server's « stored at 19 h 00 on its own day » regression
  // (functions/_lib/transfers.test.ts). The composer pre-ticks off THIS set, so a
  // miss here is what re-offers a payment already sent — the visible symptom.
  it("a line stored later in the due date's own day still covers it", () => {
    const evening = transfer({ lines: [planLine(d(2026, 7, 13) + 19 * 3600)] })
    expect(coveredDueDates([evening], 'p1', 'marc').has(d(2026, 7, 13))).toBe(true)
    expect(uncoveredDueDates(plan(), [evening], 'marc', d(2026, 7, 28))).toEqual([d(2026, 7, 27)])
  })

  it('a face with nothing sent owes every past date', () => {
    expect(uncoveredDueDates(plan(), [], 'camille', d(2026, 7, 28))).toEqual([d(2026, 7, 13), d(2026, 7, 27)])
  })
})

describe('foldAscii', () => {
  it('strips accents rather than letting a bank mangle them', () => {
    expect(foldAscii('Hypothèque')).toBe('Hypotheque')
  })

  it('drops punctuation a bank field cannot render', () => {
    expect(foldAscii('Août — garderie')).toBe('Aout garderie')
    expect(foldAscii('café ☕')).toBe('cafe')
  })

  it('collapses runs of whitespace', () => {
    expect(foldAscii('  a  b  ')).toBe('a b')
  })

  // The bug this assertion exists for: a non-breaking space is not printable ASCII,
  // so stripping first and collapsing after DELETED it and glued the words together
  // (« 3 112,82 » became « 3112,82 »). FR-CA formatting is full of them.
  it('turns a non-breaking space into a real space instead of deleting it', () => {
    expect(foldAscii(`3${NBSP}112,82${NBSP}$`)).toBe('3 112,82 $')
  })
})

describe('buildMemo', () => {
  // THE specimen: the message Marc actually sent on 14 août 2026, reference CArR4A3Q.
  // Two mortgage dates in one month plus a 2 000 $ top-up.
  it('reproduces the real message this household types by hand', () => {
    const lines: TransferLine[] = [
      planLine(d(2026, 7, 13)),
      planLine(d(2026, 7, 27)),
      { kind: 'topup', amountCents: 200000 },
    ]
    expect(buildMemo(lines, [plan()])).toBe('Hypotheque 13 27 aout renflou 2000')
  })

  it('groups day numbers by month when a send spans the boundary', () => {
    const lines: TransferLine[] = [planLine(d(2026, 7, 27)), planLine(d(2026, 8, 10))]
    expect(buildMemo(lines, [plan()])).toBe('Hypotheque 27 aout 10 sept')
  })

  it('sorts the dates even when the ticks came out of order', () => {
    const lines: TransferLine[] = [planLine(d(2026, 7, 27)), planLine(d(2026, 7, 13))]
    expect(buildMemo(lines, [plan()])).toBe('Hypotheque 13 27 aout')
  })

  it('sums several top-ups into one word', () => {
    const lines: TransferLine[] = [
      { kind: 'topup', amountCents: 150000 },
      { kind: 'topup', amountCents: 50000 },
    ]
    expect(buildMemo(lines, [plan()])).toBe('renflou 2000')
  })

  it('keeps cents only when they matter', () => {
    expect(buildMemo([{ kind: 'topup', amountCents: 200050 }], [plan()])).toBe('renflou 2000.50')
    expect(buildMemo([{ kind: 'topup', amountCents: 200000 }], [plan()])).toBe('renflou 2000')
  })

  it('names a free line with its own label', () => {
    const lines: TransferLine[] = [{ kind: 'other', label: 'Électricité', amountCents: 8750 }]
    expect(buildMemo(lines, [plan()])).toBe('Electricite 87.50')
  })

  // The generalisation reaching the bank field: a name the household typed once goes
  // to the bank under that name, beside the agreements, in the order of the rows that
  // built it — so the message reads the way the screen that wrote it does.
  it('carries a named extra to the bank under its own name', () => {
    const lines: TransferLine[] = [
      planLine(d(2026, 7, 13)),
      { kind: 'other', label: 'Renflouement', amountCents: 200000 },
      { kind: 'other', label: 'Frais de maman', amountCents: 20000 },
    ]
    expect(buildMemo(lines, [plan()])).toBe('Hypotheque 13 aout Renflouement 2000 Frais de maman 200')
  })

  it('falls back to the bare amount when a free line has no label', () => {
    expect(buildMemo([{ kind: 'other', label: '', amountCents: 5000 }], [plan()])).toBe('50')
  })

  it('keeps the plans in their own order, so the message reads the same every time', () => {
    const garderie = plan({ id: 'p2', title: 'Garderie', position: 1, due: [d(2026, 7, 20)] })
    const lines: TransferLine[] = [
      { kind: 'plan', planId: 'p2', dueAt: d(2026, 7, 20), amountCents: 10000 },
      planLine(d(2026, 7, 13)),
    ]
    expect(buildMemo(lines, [plan(), garderie])).toBe('Hypotheque 13 aout Garderie 20 aout')
  })

  it('writes an English memo when the app is in English', () => {
    const lines: TransferLine[] = [planLine(d(2026, 7, 13)), { kind: 'topup', amountCents: 200000 }]
    expect(buildMemo(lines, [plan()], 'en')).toBe('Hypotheque 13 aug topup 2000')
  })

  it('is empty for an empty draft', () => {
    expect(buildMemo([], [plan()])).toBe('')
  })

  it('ignores a plan line whose plan is gone (a soft-deleted agreement)', () => {
    expect(buildMemo([{ kind: 'plan', planId: 'ghost', dueAt: d(2026, 7, 13), amountCents: 100 }], [plan()])).toBe('')
  })

  it('never exceeds the cap a bank memo field can hold', () => {
    const many: TransferLine[] = Array.from({ length: 20 }, (_, i) => ({
      kind: 'other' as const,
      label: `Ligne numéro ${i}`,
      amountCents: 1000 + i,
    }))
    const memo = buildMemo(many, [plan()])
    expect(memo.length).toBeLessThanOrEqual(MEMO_CAP)
    // And it is still plain ASCII after the cut.
    expect(memo).toBe(foldAscii(memo))
  })
})

// THE EXTRAS. « Renflouement » was a hardcoded field with its own proposal, its own
// word in the memo and its own bucket in the year; free lines were anonymous and
// retyped every send. One mechanism now — a NAMED amount — and « Renflouement » is
// just the default name of the old unnamed line. What these assertions defend is that
// a legacy row and a row somebody named are indistinguishable from here on.
describe('extras — one named mechanism, not a special top-up', () => {
  it('names a legacy unnamed top-up with the app’s own word for it', () => {
    expect(extrasOf([{ kind: 'topup', amountCents: 200000 }], RENFLOU)).toEqual([
      { label: RENFLOU, amountCents: 200000 },
    ])
  })

  it('leaves a named line its own name, and ignores the agreements', () => {
    expect(
      extrasOf([planLine(d(2026, 7, 13)), { kind: 'other', label: 'Frais de maman', amountCents: 20000 }], RENFLOU),
    ).toEqual([{ label: 'Frais de maman', amountCents: 20000 }])
  })

  // Two top-ups on one transfer were always ONE number in the old single field. The
  // merge reproduces that by construction rather than by a summing special case.
  it('merges same-named amounts, however they were spelled', () => {
    expect(
      extrasOf(
        [
          { kind: 'topup', amountCents: 150000 },
          { kind: 'other', label: 'renflouement', amountCents: 50000 },
        ],
        RENFLOU,
      ),
    ).toEqual([{ label: RENFLOU, amountCents: 200000 }])
  })

  it('folds a name to one key across case and accents', () => {
    expect(extraKey(' Frais de MAMAN ')).toBe(extraKey('frais de maman'))
    expect(extraKey('Électricité')).toBe(extraKey('electricite'))
    expect(extraKey('')).toBe('')
    // A name with nothing ASCII left in it still keeps an identity of its own rather
    // than collapsing into the unnamed bucket with everything else.
    expect(extraKey('Ремонт')).toBe('ремонт')
  })
})

describe('rememberedExtras — « comme la dernière fois », for any name', () => {
  const sent = (id: string, sentAt: number, lines: TransferLine[], memberId: string | null = 'marc') =>
    transfer({ id, memberId, sentAt, lines })

  const older = sent('a', d(2026, 6, 14), [
    { kind: 'topup', amountCents: 150000 },
    { kind: 'other', label: 'Frais de maman', amountCents: 20000 },
  ])
  const newer = sent('b', d(2026, 7, 14), [{ kind: 'topup', amountCents: 200000 }])

  it('offers the NEWEST amount per name, newest name first', () => {
    expect(rememberedExtras([older, newer], 'marc', RENFLOU)).toEqual([
      { label: RENFLOU, amountCents: 200000 },
      { label: 'Frais de maman', amountCents: 20000 },
    ])
  })

  // Per SENDER, exactly as the top-up proposal was: a fee the other person sends is
  // not a suggestion for you.
  it('never offers what somebody else sent', () => {
    expect(rememberedExtras([older, newer], 'camille', RENFLOU)).toEqual([])
    expect(rememberedExtras([sent('c', d(2026, 7, 14), [{ kind: 'topup', amountCents: 999 }], null)], null, RENFLOU))
      .toHaveLength(1)
  })

  it('drops anything already in the draft, by name rather than by spelling', () => {
    expect(rememberedExtras([older, newer], 'marc', RENFLOU, { exclude: ['  frais de MAMAN '] })).toEqual([
      { label: RENFLOU, amountCents: 200000 },
    ])
  })

  // An unnamed amount says nothing about what it was for, so there is nothing to
  // offer back — which is the whole reason a name is worth typing once.
  it('has nothing to offer for an amount nobody named, or an amount of zero', () => {
    const anon = sent('d', d(2026, 7, 14), [
      { kind: 'other', label: '', amountCents: 5000 },
      { kind: 'other', label: 'Rien', amountCents: 0 },
    ])
    expect(rememberedExtras([anon], 'marc', RENFLOU)).toEqual([])
  })

  it('stays a short row — a composer is not a history', () => {
    const many = sent(
      'e',
      d(2026, 7, 14),
      Array.from({ length: 9 }, (_, i) => ({ kind: 'other' as const, label: `Ligne ${i}`, amountCents: 100 + i })),
    )
    expect(rememberedExtras([many], 'marc', RENFLOU)).toHaveLength(REMEMBERED_EXTRAS)
    expect(rememberedExtras([many], 'marc', RENFLOU, { limit: 2 })).toHaveLength(2)
  })
})

describe('summariseYear', () => {
  const hypo = plan()
  const garderie = plan({ id: 'p2', title: 'Garderie', position: 1, due: [d(2026, 7, 20)] })

  const marcAug = transfer({
    id: 'a',
    memberId: 'marc',
    sentAt: d(2026, 7, 14),
    lines: [planLine(d(2026, 7, 13)), planLine(d(2026, 7, 27)), { kind: 'topup', amountCents: 200000 }],
  })
  const camilleAug = transfer({
    id: 'b',
    memberId: 'camille',
    sentAt: d(2026, 7, 14),
    lines: [{ kind: 'plan', planId: 'p2', dueAt: d(2026, 7, 20), amountCents: 10000 }, { kind: 'topup', amountCents: 200000 }],
  })
  const marcLastYear = transfer({ id: 'c', memberId: 'marc', sentAt: d(2025, 7, 14), lines: [planLine(d(2025, 7, 13))] })

  const all = [marcAug, camilleAug, marcLastYear]

  it('keeps only the year asked for', () => {
    expect(summariseYear(all, [hypo, garderie], 2026, RENFLOU).transfers).toBe(2)
    expect(summariseYear(all, [hypo, garderie], 2025, RENFLOU).transfers).toBe(1)
    expect(summariseYear(all, [hypo, garderie], 2024, RENFLOU).transfers).toBe(0)
  })

  it('groups by agreement AND by person, counting the dates each one covered', () => {
    const s = summariseYear(all, [hypo, garderie], 2026, RENFLOU)
    expect(s.plans.map((p) => p.title)).toEqual(['Hypothèque', 'Garderie'])
    expect(s.plans[0].byMember).toEqual([{ memberId: 'marc', payments: 2, cents: 111282 }])
    expect(s.plans[1].byMember).toEqual([{ memberId: 'camille', payments: 1, cents: 10000 }])
  })

  it('totals each named extra per person, and the whole year once', () => {
    const s = summariseYear(all, [hypo, garderie], 2026, RENFLOU)
    // The legacy unnamed top-ups land under the app's own word for them, with the
    // faces that sent them — which the old « Autres lignes » bucket could not carry.
    expect(s.extras).toEqual([
      {
        label: RENFLOU,
        cents: 400000,
        byMember: [
          { memberId: 'camille', payments: 0, cents: 200000 },
          { memberId: 'marc', payments: 0, cents: 200000 },
        ],
      },
    ])
    // 111 282 + 200 000 (Marc) + 10 000 + 200 000 (Camille)
    expect(s.totalCents).toBe(521282)
    expect(s.byMember).toEqual([
      { memberId: 'camille', payments: 0, cents: 210000 },
      { memberId: 'marc', payments: 0, cents: 311282 },
    ])
  })

  // THE CALM CONSTRAINT, pinned. Sorting people by what they sent would make the
  // block a leaderboard; it is a receipt. Camille sent less and still comes first,
  // because the order is her id, not her amount.
  it('orders people by identity, never by amount', () => {
    const s = summariseYear(all, [hypo, garderie], 2026, RENFLOU)
    expect(s.byMember.map((x) => x.memberId)).toEqual(['camille', 'marc'])
  })

  it('folds extras by name, ignoring case AND accents', () => {
    const tr = transfer({
      id: 'd',
      sentAt: d(2026, 7, 14),
      lines: [
        { kind: 'other', label: 'Électricité', amountCents: 8750 },
        { kind: 'other', label: 'électricité', amountCents: 1250 },
        // Typed in a hurry, without the accents. One line of the year, not three.
        { kind: 'other', label: 'Electricite', amountCents: 1000 },
      ],
    })
    const s = summariseYear([tr], [hypo], 2026, RENFLOU)
    expect(s.extras).toHaveLength(1)
    expect(s.extras[0]).toMatchObject({ label: 'Électricité', cents: 11000 })
  })

  // THE GENERALISATION, pinned. A household that names « Frais de maman » once gets a
  // line of its year that reads exactly like an agreement's — a name and the faces
  // under it — rather than an anonymous number in an « Autres lignes » footnote.
  it('gives a named extra its own group, beside the legacy unnamed one', () => {
    const named = transfer({
      id: 'e',
      memberId: 'marc',
      sentAt: d(2026, 8, 14),
      lines: [
        { kind: 'other', label: 'Frais de maman', amountCents: 20000 },
        { kind: 'topup', amountCents: 200000 },
      ],
    })
    const s = summariseYear([marcAug, named], [hypo], 2026, RENFLOU)
    expect(s.extras.map((x) => x.label)).toEqual([RENFLOU, 'Frais de maman'])
    // The legacy line from marcAug and the one from `named` are the SAME group.
    expect(s.extras[0].cents).toBe(400000)
    expect(s.extras[1].byMember).toEqual([{ memberId: 'marc', payments: 0, cents: 20000 }])
  })

  it('keeps an amount nobody ever named in the total, under its own empty group', () => {
    const tr = transfer({ id: 'f', sentAt: d(2026, 7, 14), lines: [{ kind: 'other', label: '', amountCents: 5000 }] })
    const s = summariseYear([tr], [hypo], 2026, RENFLOU)
    expect(s.extras).toHaveLength(1)
    expect(s.extras[0].label).toBe('')
    expect(s.totalCents).toBe(5000)
  })

  // Money that was genuinely sent must stay in the total even when the agreement it
  // named has since been deleted — otherwise the year quietly under-reports itself.
  it('keeps a line whose agreement is gone', () => {
    const s = summariseYear([marcAug], [], 2026, RENFLOU)
    expect(s.totalCents).toBe(311282)
    expect(s.plans).toHaveLength(1)
    expect(s.plans[0].title).toBe('')
  })

  it('reports the span the year actually covers', () => {
    const s = summariseYear(all, [hypo, garderie], 2026, RENFLOU)
    expect(s.firstSentAt).toBe(d(2026, 7, 14))
    expect(s.lastSentAt).toBe(d(2026, 7, 14))
    expect(summariseYear([], [], 2026, RENFLOU).firstSentAt).toBeNull()
  })

  it('lists the years that hold something, newest first', () => {
    expect(transferYears(all)).toEqual([2026, 2025])
    expect(transferYears([])).toEqual([])
  })

  it('reads a local midnight into its own calendar year, not the one before', () => {
    // 1er janvier at local midnight is 05:00 UTC the same day — the off-by-one that
    // would file every New Year's Day transfer under the previous year.
    expect(yearOfDay(d(2027, 0, 1))).toBe(2027)
    expect(yearOfDay(d(2026, 11, 31))).toBe(2026)
  })
})

describe('catchupSeries — the gap, drawn', () => {
  const proj = (over: Partial<CatchupProjection> = {}): CatchupProjection => ({
    behindMemberId: 'marc',
    aheadMemberId: 'camille',
    gapCents: 7200000,
    asOf: d(2026, 1, 1),
    termEnd: d(2028, 7, 24),
    extraPerPayment: 30000,
    paymentsSoFar: 2,
    caughtUpCents: 60000,
    remainingCents: 7140000,
    paymentsLeft: 60,
    // Internally consistent, and it is Marc's real shape: 60 payments x 300 $ closes
    // 18 000 $ of a 71 400 $ remainder, so this arrangement does NOT finish the job.
    projectedRemainingCents: 5340000,
    ...over,
  })

  it('starts at the gap as counted and passes through today', () => {
    const s = catchupSeries(proj(), d(2026, 8, 12))!
    expect(s.past[0]).toEqual({ at: d(2026, 1, 1), cents: 7200000 })
    expect(s.past[1]).toEqual({ at: d(2026, 8, 12), cents: 7140000 })
    expect(s.maxCents).toBe(7200000)
  })

  it('reaches zero inside the term, and stays there', () => {
    // A gap small enough for the rhythm to close: 58 payments of 300 $ against 17 400 $.
    const s = catchupSeries(proj({ gapCents: 1800000, remainingCents: 1740000, projectedRemainingCents: 0 }), d(2026, 8, 12))!
    expect(s.zeroAt).not.toBeNull()
    expect(s.ahead[s.ahead.length - 1].cents).toBe(0)
    expect(s.zeroAt!).toBeGreaterThan(d(2026, 8, 12))
    expect(s.zeroAt!).toBeLessThanOrEqual(d(2028, 7, 24))
  })

  // THE HONEST ENDING. An arrangement that does not close the gap must not be drawn
  // as if it did — the line simply stops short of the floor.
  it('does not reach zero when the rhythm cannot close the gap', () => {
    const s = catchupSeries(proj(), d(2026, 8, 12))!
    expect(s.zeroAt).toBeNull()
    expect(s.ahead[s.ahead.length - 1].cents).toBe(5340000)
  })

  it('an already-closed gap is at zero from today on', () => {
    const s = catchupSeries(proj({ remainingCents: 0, projectedRemainingCents: 0 }), d(2026, 8, 12))!
    expect(s.zeroAt).toBe(d(2026, 8, 12))
    expect(s.ahead.every((p) => p.cents === 0)).toBe(true)
  })

  it('never draws outside its own box when today sits beyond the term', () => {
    const s = catchupSeries(proj(), d(2030, 0, 1))!
    expect(s.past[1].at).toBe(d(2028, 7, 24))
    const s2 = catchupSeries(proj(), d(2020, 0, 1))!
    expect(s2.past[1].at).toBe(d(2026, 1, 1))
  })

  it('is nothing to draw without a gap', () => {
    expect(catchupSeries(proj({ gapCents: 0 }), d(2026, 8, 12))).toBeNull()
    expect(catchupSeries(proj({ termEnd: d(2025, 0, 1) }), d(2026, 8, 12))).toBeNull()
  })

  it('cannot close a gap when nobody is sending extra', () => {
    expect(catchupSeries(proj({ extraPerPayment: 0 }), d(2026, 8, 12))!.zeroAt).toBeNull()
  })
})

// THE TRACKING FLOOR (Marc, 2026-09-12: « could we remove the proposed dates before
// the starting date? they could always add one in Other dates »).
//
// His agreement is anchored in February and he started recording in August, so a new
// virement arrived with seven dates already ticked — six of them fortnights from
// before the app existed, none of which he meant to send. The floor is the oldest due
// date the household has ever RECORDED for that agreement.
describe('the tracking floor', () => {
  // A long agreement: due every 2 weeks from 13 août, running well past today.
  const long = plan({
    due: [d(2026, 4, 21), d(2026, 5, 4), d(2026, 6, 2), d(2026, 7, 13), d(2026, 7, 27), d(2026, 8, 10), d(2026, 8, 24)],
  })
  const today = d(2026, 8, 12)
  // The household's book opens on 13 août: that is the oldest date it ever recorded.
  const recorded = transfer({ lines: [planLine(d(2026, 7, 13))] })

  it('is the oldest recorded due date, and null before anything is recorded', () => {
    expect(trackingStart([recorded], 'p1')).toBe(d(2026, 7, 13))
    expect(trackingStart([], 'p1')).toBeNull()
    expect(trackingStart([recorded], 'other')).toBeNull()
  })

  it('reads a line stored at 19 h 00 as its own day, like every other coverage check', () => {
    const evening = transfer({ lines: [planLine(d(2026, 7, 13) + 19 * 3600)] })
    expect(trackingStart([evening], 'p1')).toBe(d(2026, 7, 13))
  })

  // THE REGRESSION ITSELF: the three fortnights from before the book opened must stop
  // arriving pre-ticked.
  it('stops pre-ticking dates from before the household started tracking', () => {
    expect(uncoveredDueDates(long, [recorded], 'marc', today)).toEqual([d(2026, 7, 27), d(2026, 8, 10)])
  })

  it('a household that has recorded nothing yet still gets its whole history offered', () => {
    // Nothing to floor against — a brand-new agreement must not hide its own dates.
    expect(uncoveredDueDates(long, [], 'marc', today)).toEqual([
      d(2026, 4, 21),
      d(2026, 5, 4),
      d(2026, 6, 2),
      d(2026, 7, 13),
      d(2026, 7, 27),
      d(2026, 8, 10),
    ])
  })

  it('offers what is owed since the floor, plus the next three ahead', () => {
    expect(offeredDueDates(long, [recorded], today)).toEqual([
      d(2026, 7, 13),
      d(2026, 7, 27),
      d(2026, 8, 10),
      d(2026, 8, 24),
    ])
  })

  // « Une autre date » is the way back to everything the floor hides — so a date the
  // reader picked by hand must survive, even from before the book opened.
  it('keeps a date added by hand, however far back it is', () => {
    const picked = d(2026, 4, 21)
    expect(offeredDueDates(long, [recorded], today, [picked])).toContain(picked)
  })

  it('never offers more than three dates ahead', () => {
    const far = plan({ due: [d(2026, 8, 24), d(2026, 9, 7), d(2026, 9, 21), d(2026, 10, 5), d(2026, 10, 19)] })
    expect(offeredDueDates(far, [], today)).toHaveLength(UPCOMING_OFFERED)
  })
})
