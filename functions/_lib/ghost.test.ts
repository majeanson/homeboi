// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { learnedCadence, rankGhosts, trackCandidates, type PurchaseRow, type OverrideRow } from './ghost'
import type { StapleDef } from './ghostStaples'

const DAY = 86400
const NOW = 10_000_000
const daysAgo = (n: number) => NOW - n * DAY
const EGGS: StapleDef = { key: 'eggs', cadenceDays: 7, label: 'Eggs' }

function rank(opts: {
  log?: PurchaseRow[]
  overrides?: OverrideRow[]
  staples?: StapleDef[]
  openKeys?: string[]
  includeLater?: boolean
}) {
  return rankGhosts({
    log: opts.log ?? [],
    overrides: opts.overrides ?? [],
    staples: opts.staples ?? [EGGS],
    openKeys: new Set(opts.openKeys ?? []),
    now: NOW,
    includeLater: opts.includeLater,
  })
}

const buy = (key: string, at: number, text = key): PurchaseRow => ({ item_key: key, text, purchased_at: at })

describe('learnedCadence', () => {
  it('needs at least two buys to form an interval', () => {
    expect(learnedCadence([])).toBeNull()
    expect(learnedCadence([daysAgo(3)])).toBeNull()
  })

  it('returns the median interval in days', () => {
    expect(learnedCadence([daysAgo(14), daysAgo(7), NOW])).toBe(7)
  })

  it('clamps absurd gaps into a sane range', () => {
    expect(learnedCadence([daysAgo(100), NOW])).toBe(60) // capped
    expect(learnedCadence([daysAgo(1), NOW])).toBe(2) // floored
  })
})

describe('rankGhosts', () => {
  it('suggests a seeded staple that was never bought (useful day one)', () => {
    const g = rank({})
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ key: 'eggs', status: 'due' })
  })

  it('never suggests something already on the open list', () => {
    expect(rank({ openKeys: ['eggs'] })).toHaveLength(0)
  })

  it('hides an item bought recently, surfaces it as due once overdue', () => {
    expect(rank({ log: [buy('eggs', daysAgo(2))] })).toHaveLength(0) // 2/7 — too soon
    const due = rank({ log: [buy('eggs', daysAgo(8))] })
    expect(due[0]).toMatchObject({ status: 'due' })
  })

  it('marks an item two-thirds through its cadence as soon', () => {
    const g = rank({ log: [buy('eggs', daysAgo(5))] }) // 5/7 ≈ 0.71
    expect(g[0]).toMatchObject({ status: 'soon' })
  })

  it('respects a muted override', () => {
    const overrides: OverrideRow[] = [{ item_key: 'eggs', label: 'Eggs', cadence_days: null, muted: true }]
    expect(rank({ overrides })).toHaveLength(0)
  })

  it('respects a cadence override over the staple default', () => {
    const overrides: OverrideRow[] = [{ item_key: 'eggs', label: 'Eggs', cadence_days: 2, muted: false }]
    // 3 days since last buy: default 7 would hide it, override 2 makes it due.
    const g = rank({ log: [buy('eggs', daysAgo(3))], overrides })
    expect(g[0]).toMatchObject({ status: 'due', cadenceDays: 2 })
  })

  it('lets the learned cadence override the staple default', () => {
    // Bought every ~14 days; 10 days since last → learned(14) says "soon",
    // whereas the staple default(7) would have said "due".
    const log = [buy('eggs', daysAgo(38)), buy('eggs', daysAgo(24)), buy('eggs', daysAgo(10))]
    const g = rank({ log })
    expect(g[0]).toMatchObject({ status: 'soon', cadenceDays: 14 })
  })

  it('does NOT predict a one-off non-staple (manual long tail)', () => {
    const g = rank({ log: [buy('saffron', daysAgo(100))], staples: [] })
    expect(g).toHaveLength(0)
  })

  it('does NOT auto-enroll a non-staple even when bought on a rhythm — tracking is a conscious step', () => {
    // A one-time-deal item bought a few times (e.g. the same flyer special)
    // must never start haunting the strip on its own.
    const log = [buy('chips', daysAgo(21)), buy('chips', daysAgo(14)), buy('chips', daysAgo(8))]
    expect(rank({ log, staples: [] })).toHaveLength(0)
  })

  it('a consciously tracked item (override row) IS predicted, using its learned cadence', () => {
    const overrides: OverrideRow[] = [{ item_key: 'chips', label: 'Chips', cadence_days: null, muted: false }]
    const log = [buy('chips', daysAgo(21)), buy('chips', daysAgo(14)), buy('chips', daysAgo(8))]
    const g = rank({ log, overrides, staples: [] })
    expect(g[0]).toMatchObject({ key: 'chips', status: 'due', cadenceDays: 7 })
  })

  it('includeLater surfaces a tracked item not yet near renewal, after due/soon', () => {
    const staples: StapleDef[] = [EGGS, { key: 'bread', cadenceDays: 7, label: 'Bread' }]
    // eggs overdue (due), bread bought yesterday (1/7 — far from renewal).
    const log = [buy('eggs', daysAgo(8)), buy('bread', daysAgo(1))]
    expect(rank({ log, staples }).map((x) => x.key)).toEqual(['eggs']) // default: hidden
    const g = rank({ log, staples, includeLater: true })
    expect(g.map((x) => x.key)).toEqual(['eggs', 'bread'])
    expect(g[1].status).toBe('later')
  })

  it('includeLater still never suggests open-list items nor muted ones', () => {
    const staples: StapleDef[] = [EGGS, { key: 'bread', cadenceDays: 7, label: 'Bread' }]
    const overrides: OverrideRow[] = [{ item_key: 'bread', label: 'Bread', cadence_days: null, muted: true }]
    const g = rank({ log: [buy('eggs', daysAgo(1))], staples, overrides, openKeys: ['eggs'], includeLater: true })
    expect(g).toHaveLength(0)
  })

  it('ranks the most-bought due items first', () => {
    const staples: StapleDef[] = [EGGS, { key: 'bread', cadenceDays: 5, label: 'Bread' }]
    const log = [
      buy('eggs', daysAgo(30)), buy('eggs', daysAgo(20)), buy('eggs', daysAgo(10)),
      buy('bread', daysAgo(20)), buy('bread', daysAgo(10)),
    ]
    const g = rank({ log, staples })
    expect(g.map((x) => x.key)).toEqual(['eggs', 'bread'])
  })
})

describe('trackCandidates', () => {
  it('offers a frequent untracked buy with its learned cadence', () => {
    const log = [
      buy('chips', daysAgo(21), 'Chips BBQ'),
      buy('chips', daysAgo(14), 'Chips BBQ'),
      buy('chips', daysAgo(7), 'Chips BBQ'),
    ]
    const c = trackCandidates(log, [], [])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ key: 'chips', label: 'Chips BBQ', count: 3, cadenceDays: 7 })
  })

  it('never offers a one-time deal (below the frequency bar)', () => {
    expect(trackCandidates([buy('gadget', daysAgo(5))], [], [])).toHaveLength(0)
    expect(trackCandidates([buy('gadget', daysAgo(12)), buy('gadget', daysAgo(5))], [], [])).toHaveLength(0)
  })

  it('skips items already tracked (staple or override)', () => {
    const log = [buy('eggs', daysAgo(21)), buy('eggs', daysAgo(14)), buy('eggs', daysAgo(7))]
    expect(trackCandidates(log, [], [EGGS])).toHaveLength(0)
    const ov: OverrideRow[] = [{ item_key: 'eggs', label: 'Eggs', cadence_days: 7, muted: false }]
    expect(trackCandidates(log, ov, [])).toHaveLength(0)
  })

  it('orders by frequency and caps the list', () => {
    const log: PurchaseRow[] = []
    for (let i = 0; i < 8; i++) {
      for (let n = 0; n < 3 + (i % 2); n++) log.push(buy(`item${i}`, daysAgo(7 * n + i)))
    }
    const c = trackCandidates(log, [], [])
    expect(c.length).toBeLessThanOrEqual(6)
    for (let i = 1; i < c.length; i++) expect(c[i - 1].count).toBeGreaterThanOrEqual(c[i].count)
  })
})
