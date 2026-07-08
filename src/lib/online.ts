import { useEffect, useState } from 'react'
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
//     and this suppression kills it without a debounce timer.
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

// True when the shared household data has gone quiet for longer than the current
// poll gear allows for — independent of `useOnline()`. Drives the second,
// "données de…" condition on `OfflineBanner` (online but stale still shows the
// bar); a device that's genuinely offline is already covered by `useOnline()`.
export function useDataFreshness(): boolean {
  const qc = useQueryClient()
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const check = () => {
      let newest = 0
      let anyFirstRetryInFlight = false
      for (const q of qc.getQueryCache().getAll()) {
        if (q.meta?.live !== true) continue
        if (q.state.status === 'success' && q.state.dataUpdatedAt > newest) newest = q.state.dataUpdatedAt
        if (q.state.fetchStatus === 'fetching' && q.state.fetchFailureCount === 0) anyFirstRetryInFlight = true
      }
      setStale(isStaleAt(newest, Date.now(), liveInterval(), anyFirstRetryInFlight))
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
