import { describe, it, expect } from 'vitest'
import {
  buildMemo,
  coveredDueDates,
  foldAscii,
  transferTotal,
  uncoveredDueDates,
  MEMO_CAP,
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
