import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { liveInterval } from './query'

// Are we online? navigator.onLine + the online/offline events. Coarse on purpose
// (the OS can claim online with no real connectivity) — it drives the calm "hors
// ligne" badge, so a glance at cached data is trusted, not a hard gate on writes.
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

// --- The line of truth (bmad/10 B-7) ----------------------------------------
// `navigator.onLine` only reflects the network *interface*, not whether data is
// actually flowing — a captive portal, a dead uplink past the router, or a Worker
// outage all still read "online" while the board silently stops refreshing. This
// is the second, independent signal: how long ago did the newest *live* query
// (meta.live === true — the shared household data, never the external feeds that
// keep their own slow cache) last land successfully, compared to how often it's
// SUPPOSED to land at the current poll gear (lib/query.ts `liveInterval`).
//
// Pure so the boundary math is unit-testable without mounting React or Query.
//   - `anyFirstRetryInFlight` true suppresses the flag outright: a query that just
//     started fetching (fetchStatus 'fetching') and hasn't failed yet
//     (fetchFailureCount === 0) is almost always the refetchOnWindowFocus/realtime
//     catch-up firing the instant a backgrounded tablet wakes up — showing "stale"
//     for the one tick before that fetch resolves would be a false alarm flicker,
//     and this suppression kills it without a debounce timer. The caller (below)
//     only feeds this true for `SUPPRESS_WINDOW_MS` after a fetch starts — `api()`
//     has no client-side timeout, so a true black-hole connection (packets dropped
//     silently, no TCP RST) can leave a fetch's promise unresolved indefinitely;
//     without a bound, that ONE hung query would suppress the stale flag forever
//     for the whole board no matter how old every other live query's data is.
//   - `newestMs <= 0` (no live query has ever succeeded yet, e.g. first paint)
//     is never "stale" — there is nothing to compare against.
//   - Threshold = `max(3 × gearMs, 90_000)`: three missed poll cycles at whatever
//     gear is active right now, floored at 90 s so the two fast gears (10 s awake,
//     60 s realtime-awake) don't trip on ordinary jitter. At the idle gear (120 s)
//     that's 6 min — long enough that a healthy idling kiosk (which only polls
//     every 2 min by design) never trips it, short enough that a real outage still
//     surfaces well within the hour.
export function isStaleAt(newestMs: number, nowMs: number, gearMs: number, anyFirstRetryInFlight: boolean): boolean {
  if (anyFirstRetryInFlight) return false
  if (newestMs <= 0) return false
  const threshold = Math.max(3 * gearMs, 90_000)
  return nowMs - newestMs > threshold
}

// Re-evaluate on a slow timer (not per-second — this is a calm awareness stamp,
// not a countdown) plus whenever the query cache itself changes, so a fresh poll
// clears the flag immediately instead of waiting for the next tick.
const CHECK_MS = 5_000

// How long a "first fetch in flight" is allowed to suppress the stale flag for.
// A healthy refetchOnWindowFocus/realtime catch-up settles in well under this;
// a fetch still pending past it is presumed hung (dead uplink, no TCP RST) rather
// than "about to resolve," so it stops masking staleness instead of doing so
// forever. Comfortably above any normal round-trip, comfortably below the 90 s
// stale floor so a hung fetch can't itself delay the banner.
export const SUPPRESS_WINDOW_MS = 20_000

// The slice of query-cache state `evaluateFreshness` needs, so it can take a
// plain array instead of a live `Query` object (keeps it unit-testable without
// mounting Query).
export interface LiveQuerySnapshot {
  queryHash: string
  live: boolean
  succeeded: boolean
  dataUpdatedAt: number
  fetching: boolean
  fetchFailureCount: number
}

// Pure: derives the newest successful live fetch + whether to suppress the
// stale flag, from a snapshot of the query cache plus a `queryHash → when this
// fetch started` bookkeeping map (mutated in place — the caller owns its
// lifetime, one map per mounted `useDataFreshness`). Bounding the suppression to
// `suppressWindowMs` per query is what stops a single hung fetch (`api()` has no
// client-side timeout) from masking staleness for the whole board forever.
export function evaluateFreshness(
  queries: LiveQuerySnapshot[],
  nowMs: number,
  fetchStartedAt: Map<string, number>,
  suppressWindowMs = SUPPRESS_WINDOW_MS,
): { newestMs: number; anyFirstRetryInFlight: boolean } {
  let newest = 0
  let anyFirstRetryInFlight = false
  const stillFetching = new Set<string>()
  for (const q of queries) {
    if (!q.live) continue
    if (q.succeeded && q.dataUpdatedAt > newest) newest = q.dataUpdatedAt
    if (q.fetching && q.fetchFailureCount === 0) {
      stillFetching.add(q.queryHash)
      let startedAt = fetchStartedAt.get(q.queryHash)
      if (startedAt === undefined) {
        startedAt = nowMs
        fetchStartedAt.set(q.queryHash, startedAt)
      }
      if (nowMs - startedAt <= suppressWindowMs) anyFirstRetryInFlight = true
    }
  }
  // Forget queries that stopped fetching (resolved, failed, or dropped) so a
  // future fetch on the same query gets its own fresh suppression window.
  for (const hash of fetchStartedAt.keys()) {
    if (!stillFetching.has(hash)) fetchStartedAt.delete(hash)
  }
  return { newestMs: newest, anyFirstRetryInFlight }
}

// True when the shared household data has gone quiet for longer than the current
// poll gear allows for — independent of `useOnline()`. Drives the second,
// "données de…" condition on `OfflineBanner` (online but stale still shows the
// bar); a device that's genuinely offline is already covered by `useOnline()`.
export function useDataFreshness(): boolean {
  const qc = useQueryClient()
  const [stale, setStale] = useState(false)
  // queryHash → when we first observed it mid-first-fetch; lives for the whole
  // mount so `evaluateFreshness` can bound the suppression per query.
  const fetchStartedAt = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const snapshot: LiveQuerySnapshot[] = qc
        .getQueryCache()
        .getAll()
        .map((q) => ({
          queryHash: q.queryHash,
          live: q.meta?.live === true,
          succeeded: q.state.status === 'success',
          dataUpdatedAt: q.state.dataUpdatedAt,
          fetching: q.state.fetchStatus === 'fetching',
          fetchFailureCount: q.state.fetchFailureCount,
        }))
      const { newestMs, anyFirstRetryInFlight } = evaluateFreshness(snapshot, now, fetchStartedAt.current)
      setStale(isStaleAt(newestMs, now, liveInterval(), anyFirstRetryInFlight))
    }
    check()
    const id = setInterval(check, CHECK_MS)
    const unsub = qc.getQueryCache().subscribe(check)
    return () => {
      clearInterval(id)
      unsub()
    }
  }, [qc])
  return stale
}

// The newest successful fetch across every cached query (not just live ones —
// this backs the freshness stamp shown in BOTH the true-offline and the stale
// banners, so it should read the same "how fresh is what's on screen" number a
// user would expect regardless of which condition tripped the bar).
export function newestFetchMs(qc: ReturnType<typeof useQueryClient>): number {
  let newest = 0
  for (const q of qc.getQueryCache().getAll()) {
    if (q.state.status === 'success' && q.state.dataUpdatedAt > newest) newest = q.state.dataUpdatedAt
  }
  return newest
}
