// The single TanStack Query client. Data-fetching state (loading, caching,
// polling, stale-while-revalidate, optimistic updates) lives here and in the
// per-resource hooks rather than being hand-rolled in every page.
//
// Platform-agnostic on purpose: this and the query hooks depend only on `api`
// (the one transport chokepoint), so the data layer would port to React
// Native/Expo by swapping `api`'s transport — no page logic changes.
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError, isUnauthorized } from './api'
import { emitAuthLost } from './authEvents'
import { isRealtimeConnected } from './realtime'

// Central 401 interception: ANY query or mutation coming back unauthorized
// broadcasts auth-lost, so a revoked device token / expired session lands the
// whole app on the right door at once instead of each page discovering it on
// its own poll schedule. Subscribers are idempotent — a burst of failing
// queries collapses into one state change.
const broadcast401 = (err: unknown) => {
  if (isUnauthorized(err)) emitAuthLost()
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: broadcast401 }),
  mutationCache: new MutationCache({ onError: broadcast401 }),
  defaultOptions: {
    queries: {
      // A 4xx (401 not-paired, 400 bad input) won't fix itself by retrying;
      // only retry transient server/network failures, and only briefly.
      retry: (count, err) => {
        if (err instanceof ApiError && err.status < 500) return false
        return count < 2
      },
      // Dedupe the burst of reads when several surfaces mount at once, without
      // masking real changes for long. Polling surfaces set their own interval.
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
})

// --- Adaptive ("sleep") polling for shared state ----------------------------
// A wall-mounted board is foreground 24/7, so a flat fast poll would burn the
// Worker request budget even when nobody's in the room. The poll therefore picks
// a cadence from TWO axes:
//
//   • awake vs asleep — fast while someone's actively using the screen, a quiet
//     heartbeat after a stretch of no interaction. Touching the screen snaps back
//     to fast AND refetches immediately, so the first tap shows fresh data.
//   • push vs no-push — when the realtime socket is OPEN (src/lib/realtime.ts),
//     cross-device changes arrive as instant invalidate messages, so polling only
//     needs to be a slow safety heartbeat. When the socket is down, polling is the
//     ONLY freshness mechanism, so it runs fast. realtime.ts also refetches once on
//     a drop, so no change is missed in the window before the gear switches back.
//
// This is the free-tier capacity lever: the board poll is the dominant cost, and a
// connected household runs it ~6x slower (60s/300s vs 10s/120s), cutting Worker
// requests + D1 row reads proportionally — without trading away freshness, because
// push covers the gap. When realtime is gated off, `isRealtimeConnected()` is
// always false and only the fast pair is ever used (pre-realtime behaviour).
const ACTIVE_POLL_MS = 10_000 // no push, someone's using it → near-instant sync via polling
const IDLE_POLL_MS = 120_000 // no push, nobody's touched it for a while → quiet heartbeat
const RT_ACTIVE_POLL_MS = 60_000 // push live + awake → slow safety heartbeat (push owns instant)
const RT_IDLE_POLL_MS = 300_000 // push live + asleep → very quiet safety heartbeat
const IDLE_AFTER_MS = 60_000 // no interaction this long → treat the screen as asleep

// Init to "now" so a fresh load starts in the fast gear.
let lastActivityAt = Date.now()
const isAwake = () => Date.now() - lastActivityAt < IDLE_AFTER_MS

// The cadence for a live query right now, off both axes (push and awake). Read by
// `live.refetchInterval` on every tick, so flipping either axis takes effect at the
// next tick with no re-subscription. Exported (bmad/10 B-7) so the staleness stamp
// (lib/online.ts) can size its "how long is too long" threshold off the SAME gear —
// a change to the poll cadence here automatically retunes the stale threshold too.
export const liveInterval = () =>
  isRealtimeConnected()
    ? isAwake()
      ? RT_ACTIVE_POLL_MS
      : RT_IDLE_POLL_MS
    : isAwake()
      ? ACTIVE_POLL_MS
      : IDLE_POLL_MS

// Re-poll only the shared/live queries (tagged via meta below) — never the
// external feeds (weather/flyers/deals), which keep their own slow cache.
function wakeLiveQueries() {
  void queryClient.refetchQueries({ type: 'active', predicate: (q) => q.meta?.live === true })
}

// Wake on genuine interaction. The forced refetch fires ONLY on the asleep→awake
// edge — taps during active use are already covered by the fast poll, so we don't
// spike requests on every click. Tab re-focus is handled by refetchOnWindowFocus;
// here we just reset the clock so polling resumes in the fast gear.
if (typeof window !== 'undefined') {
  const onInteract = () => {
    const wasAsleep = !isAwake()
    lastActivityAt = Date.now()
    if (wasAsleep) wakeLiveQueries()
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, onInteract, { passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastActivityAt = Date.now()
  })
}

// Options for any query reading shared household state that another member can
// change from another device (the board, meal plan, pantry, recipes, routines,
// photos). Spread into useQuery: `useQuery({ queryKey, queryFn, ...live })`.
//
// Freshness is push-when-available, polling-always: a change on one phone lands on
// every other awake screen either via a realtime invalidate (instant) or, if the
// socket is down, within the active poll cadence. `refetchOnWindowFocus` +
// `staleTime: 0` make re-foregrounding a left-on tablet refetch instantly.
// TanStack pauses the interval while the tab is hidden and resumes on focus, so
// backgrounded devices cost nothing. `meta.live` tags these for the wake refetch
// (and for the catch-up refetch realtime.ts fires when the socket drops).
// Surfaces showing external feeds (weather, flyers, deals) or settings (Operator)
// intentionally opt out — they keep their own slower/static cache policy.
export const live = {
  refetchInterval: liveInterval,
  refetchOnWindowFocus: true,
  staleTime: 0,
  meta: { live: true },
} as const

// For a BROWSE surface that deliberately has no poll (Mois, L'année, L'auto's
// month read — D-18: fetched when the view opens, never polled): the client
// default is `refetchOnWindowFocus: false` and retries stop after 2, so once a
// fetch failed NOTHING ever retried it — the calendar sat blank until a hard
// refresh (Marc, 2026-09-02: « my calendar doesn't work and can't load until I
// do a hard refresh »). This heals failure WITHOUT polling success: re-fetch on
// re-focus (free when the data is fine — staleTime still gates it), and only
// while the query sits in error, retry on a quiet interval. The « Réessayer »
// button (LoadError) stays the immediate manual door.
export const healOnError = {
  refetchOnWindowFocus: true,
  refetchInterval: (q: { state: { status: string } }) => (q.state.status === 'error' ? 60_000 : false),
} as const
