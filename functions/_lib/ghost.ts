// Pure ranking logic for the ghost list — kept separate from the D1 handler so
// it's unit-testable. Given the purchase history, the operator's overrides, and
// the code-defined staples, decide which items to gently suggest re-buying and
// whether each is "due" or coming "soon".
//
// Calm by design (NFR-CALM): we only ever surface things that are actually near
// their renewal point, capped to a handful — never the whole catalogue, never a
// score. The split the user asked for falls out naturally: high-frequency
// staples (eggs/bread/milk) have a cadence from day one and recur; rare one-off
// items only appear once they've earned a learned cadence, else they're manual.
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
  status: 'due' | 'soon'
  cadenceDays: number
  lastAt: number | null
  count: number
}

const DAY = 86400
const MIN_CADENCE = 2
const MAX_CADENCE = 60
const SOON_RATIO = 0.66 // show as "soon" once two-thirds through the cadence
const DEFAULT_LIMIT = 8

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
}

export function rankGhosts({ log, overrides, staples, openKeys, now, limit = DEFAULT_LIMIT }: RankInput): Ghost[] {
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

  // Candidate keys: every staple, everything ever bought, and every manual
  // override (an operator-added custom staple).
  const keys = new Set<string>([...stapleByKey.keys(), ...agg.keys(), ...overrideByKey.keys()])

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
    if (ratio < SOON_RATIO) continue
    const status: Ghost['status'] = ratio >= 1 ? 'due' : 'soon'

    const label = ov?.label ?? staple?.label ?? a?.lastText ?? key
    out.push({ key, label, status, cadenceDays: cadence, lastAt, count: a?.count ?? 0 })
  }

  // Due before soon; within a status, the things you buy most come first
  // ("top picked through time"), then the most overdue, then alphabetical.
  out.sort((x, y) => {
    const sx = x.status === 'due' ? 0 : 1
    const sy = y.status === 'due' ? 0 : 1
    if (sx !== sy) return sx - sy
    if (y.count !== x.count) return y.count - x.count
    const rx = x.lastAt == null ? Infinity : (now - x.lastAt) / DAY / x.cadenceDays
    const ry = y.lastAt == null ? Infinity : (now - y.lastAt) / DAY / y.cadenceDays
    if (ry !== rx) return ry - rx
    return x.label.localeCompare(y.label)
  })

  return out.slice(0, limit)
}
