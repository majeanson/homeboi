// The single TanStack Query client. Data-fetching state (loading, caching,
// polling, stale-while-revalidate, optimistic updates) lives here and in the
// per-resource hooks rather than being hand-rolled in every page.
//
// Platform-agnostic on purpose: this and the query hooks depend only on `api`
// (the one transport chokepoint), so the data layer would port to React
// Native/Expo by swapping `api`'s transport — no page logic changes.
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
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
// Worker request budget even when nobody's in the room. Instead the poll has two
// gears: a fast cadence while someone's actively using the screen, and a quiet
// heartbeat after a stretch of no interaction. The moment someone touches the
// screen again we snap back to fast AND refetch immediately, so the first tap
// shows fresh data without waiting for a tick.
const ACTIVE_POLL_MS = 10_000 // someone's using it → near-instant cross-device sync
const IDLE_POLL_MS = 120_000 // nobody's touched it for a while → quiet heartbeat
const IDLE_AFTER_MS = 60_000 // no interaction this long → treat the screen as asleep

// Init to "now" so a fresh load starts in the fast gear.
let lastActivityAt = Date.now()
const isAwake = () => Date.now() - lastActivityAt < IDLE_AFTER_MS

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
// Freshness here is polling, not push: a change on one phone lands on every
// other awake screen within the active cadence, and `refetchOnWindowFocus` +
// `staleTime: 0` make re-foregrounding a left-on tablet refetch instantly.
// TanStack pauses the interval while the tab is hidden and resumes on focus, so
// backgrounded devices cost nothing. `meta.live` tags these for the wake refetch.
// Surfaces showing external feeds (weather, flyers, deals) or settings (Operator)
// intentionally opt out — they keep their own slower/static cache policy.
export const live = {
  refetchInterval: () => (isAwake() ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  refetchOnWindowFocus: true,
  staleTime: 0,
  meta: { live: true },
} as const
