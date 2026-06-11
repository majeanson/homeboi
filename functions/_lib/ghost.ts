// Pure ranking logic for the ghost list — kept separate from the D1 handler so
// it's unit-testable. Given the purchase history, the operator's overrides, and
// the code-defined staples, decide which items to gently suggest re-buying and
// whether each is "due" or coming "soon".
//
// Calm by design (NFR-CALM): we only ever surface things that are actually near
// their renewal point, capped to a handful — never the whole catalogue, never a
// score.
//
// TRACKING IS A CONSCIOUS STEP: only the code-defined staples and the items the
// operator explicitly added are ever predicted. Buying something — even buying
// it twice — never auto-enrolls it (a one-time flyer deal must not haunt the
// settings forever). The purchase history's job is narrower: it refines the
// CADENCE of items already tracked, and feeds `trackCandidates` so the operator
// can opt a frequent buy in with one deliberate tap.
import type { StapleDef } from './ghostStaples'

export interface PurchaseRow {
  item_key: string
  text: string
  purchased_at: number // unix seconds
}

export interface OverrideRow {
  item_key: string
  label: string
  cadence_days: number | null
  muted: boolean
}

export interface Ghost {
  key: string
  label: string
  status: 'due' | 'soon' | 'later'
  cadenceDays: number
  lastAt: number | null
  count: number
}

const DAY = 86400
const MIN_CADENCE = 2
const MAX_CADENCE = 60
const SOON_RATIO = 0.66 // show as "soon" once two-thirds through the cadence
const DEFAULT_LIMIT = 8
const LATER_LIMIT = 12 // tracked-but-not-near items, behind the strip's "+N"

// Median renewal interval (in whole days) from a key's purchase timestamps.
// Needs at least two buys to form one interval; null otherwise. Clamped so one
// weird gap can't push a suggestion months out (or spam it daily).
export function learnedCadence(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null
  const sorted = [...timestamps].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY)
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.min(MAX_CADENCE, Math.max(MIN_CADENCE, Math.round(median)))
}

interface Agg {
  count: number
  lastAt: number
  lastText: string
  timestamps: number[]
}

export interface RankInput {
  log: PurchaseRow[]
  overrides: OverrideRow[]
  staples: StapleDef[]
  openKeys: Set<string>
  now: number // unix seconds
  limit?: number
  // Also return tracked items that aren't near renewal yet (status 'later').
  // The list page wants the whole tracked set tappable — the strip keeps them
  // quiet behind its "+N" fold, so the calm cap still applies to what's SHOWN.
  includeLater?: boolean
}

export function rankGhosts({ log, overrides, staples, openKeys, now, limit = DEFAULT_LIMIT, includeLater = false }: RankInput): Ghost[] {
  // Aggregate history per key.
  const agg = new Map<string, Agg>()
  for (const row of log) {
    const a = agg.get(row.item_key)
    if (!a) {
      agg.set(row.item_key, { count: 1, lastAt: row.purchased_at, lastText: row.text, timestamps: [row.purchased_at] })
    } else {
      a.count++
      a.timestamps.push(row.purchased_at)
      if (row.purchased_at >= a.lastAt) {
        a.lastAt = row.purchased_at
        a.lastText = row.text
      }
    }
  }

  const overrideByKey = new Map(overrides.map((o) => [o.item_key, o]))
  const stapleByKey = new Map(staples.map((s) => [s.key, s]))

  // Candidate keys: the staples and the operator's own rows ONLY. Purchase
  // history is deliberately NOT a candidate source — being bought doesn't
  // enroll an item; it only tunes the cadence of items already tracked.
  const keys = new Set<string>([...stapleByKey.keys(), ...overrideByKey.keys()])

  const out: Ghost[] = []
  for (const key of keys) {
    if (openKeys.has(key)) continue // already on the list — nothing to suggest
    const ov = overrideByKey.get(key)
    if (ov?.muted) continue
    const a = agg.get(key)
    const staple = stapleByKey.get(key)

    const cadence = ov?.cadence_days ?? learnedCadence(a?.timestamps ?? []) ?? staple?.cadenceDays ?? null
    if (cadence == null) continue // no basis to predict — the manual long tail

    const lastAt = a?.lastAt ?? null
    // Never bought (a fresh seeded/added staple) → due now, so it's useful on
    // day one. Otherwise gate on how far through the cadence we are.
    const ratio = lastAt == null ? Number.POSITIVE_INFINITY : (now - lastAt) / DAY / cadence
    if (ratio < SOON_RATIO && !includeLater) continue
    const status: Ghost['status'] = ratio >= 1 ? 'due' : ratio >= SOON_RATIO ? 'soon' : 'later'

    const label = ov?.label ?? staple?.label ?? a?.lastText ?? key
    out.push({ key, label, status, cadenceDays: cadence, lastAt, count: a?.count ?? 0 })
  }

  // Due before soon before later; within a status, the things you buy most come
  // first ("top picked through time"), then the most overdue, then alphabetical.
  const rank = (s: Ghost['status']) => (s === 'due' ? 0 : s === 'soon' ? 1 : 2)
  out.sort((x, y) => {
    if (rank(x.status) !== rank(y.status)) return rank(x.status) - rank(y.status)
    if (y.count !== x.count) return y.count - x.count
    const rx = x.lastAt == null ? Infinity : (now - x.lastAt) / DAY / x.cadenceDays
    const ry = y.lastAt == null ? Infinity : (now - y.lastAt) / DAY / y.cadenceDays
    if (ry !== rx) return ry - rx
    return x.label.localeCompare(y.label)
  })

  // The calm cap applies to the urgent statuses; 'later' rides behind them with
  // its own (looser) cap so the strip's fold has something to offer.
  const near = out.filter((g) => g.status !== 'later').slice(0, limit)
  const later = out.filter((g) => g.status === 'later').slice(0, LATER_LIMIT)
  return [...near, ...later]
}

export interface TrackCandidate {
  key: string
  label: string
  count: number
  cadenceDays: number
}

// The conscious-step bridge: untracked items the household ACTUALLY buys on a
// rhythm (≥ minCount buys AND a learnable cadence), offered in Settings as a
// one-tap "track it?". Opt-in only — nothing enters the ghost set without this
// tap (or the manual add form). A one-time deal (count 1) never qualifies.
const CANDIDATE_MIN_COUNT = 3
const CANDIDATE_LIMIT = 6

export function trackCandidates(
  log: PurchaseRow[],
  overrides: OverrideRow[],
  staples: StapleDef[],
  { minCount = CANDIDATE_MIN_COUNT, limit = CANDIDATE_LIMIT }: { minCount?: number; limit?: number } = {},
): TrackCandidate[] {
  const tracked = new Set<string>([...staples.map((s) => s.key), ...overrides.map((o) => o.item_key)])
  const agg = new Map<string, { count: number; lastAt: number; lastText: string; timestamps: number[] }>()
  for (const row of log) {
    if (tracked.has(row.item_key)) continue
    const a = agg.get(row.item_key)
    if (!a) {
      agg.set(row.item_key, { count: 1, lastAt: row.purchased_at, lastText: row.text, timestamps: [row.purchased_at] })
    } else {
      a.count++
      a.timestamps.push(row.purchased_at)
      if (row.purchased_at >= a.lastAt) {
        a.lastAt = row.purchased_at
        a.lastText = row.text
      }
    }
  }
  const out: TrackCandidate[] = []
  for (const [key, a] of agg) {
    if (a.count < minCount) continue
    const cadence = learnedCadence(a.timestamps)
    if (cadence == null) continue
    out.push({ key, label: a.lastText, count: a.count, cadenceDays: cadence })
  }
  out.sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
  return out.slice(0, limit)
}
