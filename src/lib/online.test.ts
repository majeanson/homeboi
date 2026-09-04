import { describe, expect, it } from 'vitest'
import { evaluateFreshness, isStaleAt, type LiveQuerySnapshot, isBoardStale } from './online'

// bmad/10 B-7 — "La ligne de vérité." isStaleAt is the pure boundary math behind
// the online-but-stale banner: threshold = max(3 × gearMs, 90_000). Exhaustive on
// the gear table (lib/query.ts) so a future poll-cadence change gets caught here
// first, plus the two suppression rules (first-fetch-in-flight, no data yet).
describe('isStaleAt', () => {
  const NOW = 1_000_000_000 // arbitrary fixed "now" in ms

  // --- the four real poll gears from lib/query.ts -----------------------------
  const ACTIVE_POLL_MS = 10_000 // no push, awake
  const IDLE_POLL_MS = 120_000 // no push, asleep
  const RT_ACTIVE_POLL_MS = 60_000 // push live, awake
  const RT_IDLE_POLL_MS = 300_000 // push live, asleep

  describe('gear: active (10 s) — floored at the 90 s minimum, not 30 s', () => {
    const gear = ACTIVE_POLL_MS
    const threshold = 90_000
    it('not stale just under the floor', () => {
      expect(isStaleAt(NOW - (threshold - 1), NOW, gear, false)).toBe(false)
    })
    it('not stale exactly at the floor (strictly-greater-than)', () => {
      expect(isStaleAt(NOW - threshold, NOW, gear, false)).toBe(false)
    })
    it('stale just past the floor', () => {
      expect(isStaleAt(NOW - (threshold + 1), NOW, gear, false)).toBe(true)
    })
  })

  describe('gear: realtime-active (60 s) — 3× = 180 s, above the floor', () => {
    const gear = RT_ACTIVE_POLL_MS
    const threshold = 3 * gear
    it('not stale under threshold', () => {
      expect(isStaleAt(NOW - (threshold - 1), NOW, gear, false)).toBe(false)
    })
    it('not stale exactly at threshold', () => {
      expect(isStaleAt(NOW - threshold, NOW, gear, false)).toBe(false)
    })
    it('stale past threshold', () => {
      expect(isStaleAt(NOW - (threshold + 1), NOW, gear, false)).toBe(true)
    })
  })

  describe('gear: idle (120 s) — trips at 6 min, never before', () => {
    const gear = IDLE_POLL_MS
    const sixMin = 6 * 60_000
    it('3 × gearMs computes to exactly 6 minutes', () => {
      expect(3 * gear).toBe(sixMin)
    })
    it('a healthy idling kiosk (one missed poll ≈ 2 min gap) never trips', () => {
      expect(isStaleAt(NOW - gear, NOW, gear, false)).toBe(false)
      expect(isStaleAt(NOW - 2 * gear, NOW, gear, false)).toBe(false)
    })
    it('not stale one ms under 6 min', () => {
      expect(isStaleAt(NOW - (sixMin - 1), NOW, gear, false)).toBe(false)
    })
    it('not stale exactly at 6 min (boundary is exclusive)', () => {
      expect(isStaleAt(NOW - sixMin, NOW, gear, false)).toBe(false)
    })
    it('stale one ms past 6 min', () => {
      expect(isStaleAt(NOW - (sixMin + 1), NOW, gear, false)).toBe(true)
    })
  })

  describe('gear: realtime-idle (300 s) — 3× = 15 min', () => {
    const gear = RT_IDLE_POLL_MS
    const threshold = 3 * gear
    it('not stale under threshold', () => {
      expect(isStaleAt(NOW - (threshold - 1), NOW, gear, false)).toBe(false)
    })
    it('stale past threshold', () => {
      expect(isStaleAt(NOW - (threshold + 1), NOW, gear, false)).toBe(true)
    })
  })

  describe('first-fetch-in-flight suppression', () => {
    it('suppresses stale regardless of how old the data is', () => {
      expect(isStaleAt(0, NOW, IDLE_POLL_MS, true)).toBe(false)
      expect(isStaleAt(NOW - 10_000_000, NOW, IDLE_POLL_MS, true)).toBe(false)
    })
    it('kills the resume-from-background flash: data is old, but the very first refetch is already in flight', () => {
      // A backgrounded kiosk wakes up; refetchOnWindowFocus fires immediately.
      // Before that fetch resolves, the cache is still hours-stale — without the
      // suppression this would flash the banner for one tick.
      const hoursOld = NOW - 3 * 60 * 60 * 1000
      expect(isStaleAt(hoursOld, NOW, RT_ACTIVE_POLL_MS, true)).toBe(false)
      // Once the in-flight flag drops (fetch settled), the same gap is judged normally.
      expect(isStaleAt(hoursOld, NOW, RT_ACTIVE_POLL_MS, false)).toBe(true)
    })
  })

  describe('no data yet', () => {
    it('newestMs 0 is never stale (nothing to compare against, e.g. first paint)', () => {
      expect(isStaleAt(0, NOW, ACTIVE_POLL_MS, false)).toBe(false)
    })
    it('negative newestMs (defensive) is never stale', () => {
      expect(isStaleAt(-1, NOW, ACTIVE_POLL_MS, false)).toBe(false)
    })
  })

  describe('degenerate gearMs', () => {
    it('gearMs 0 still floors at the 90 s minimum', () => {
      expect(isStaleAt(NOW - 90_000, NOW, 0, false)).toBe(false)
      expect(isStaleAt(NOW - 90_001, NOW, 0, false)).toBe(true)
    })
  })
})

// bmad/10 B-7 review — a hung fetch (api() has no client-side timeout, so a true
// black-hole connection never settles success or error) must not suppress the
// stale flag forever. evaluateFreshness bounds the suppression per query to
// SUPPRESS_WINDOW_MS instead of the whole fetch lifetime.
describe('evaluateFreshness', () => {
  const NOW = 1_000_000_000
  const WINDOW = 20_000

  function q(over: Partial<LiveQuerySnapshot>): LiveQuerySnapshot {
    return {
      queryHash: 'q',
      live: true,
      dataUpdatedAt: 0,
      fetching: false,
      fetchFailureCount: 0,
      ...over,
    }
  }

  it('non-live queries never contribute newest or suppression', () => {
    const map = new Map<string, number>()
    const { newestMs, anyFirstRetryInFlight } = evaluateFreshness(
      [q({ live: false, dataUpdatedAt: NOW, fetching: true })],
      NOW,
      map,
      WINDOW,
    )
    expect(newestMs).toBe(0)
    expect(anyFirstRetryInFlight).toBe(false)
  })

  it('a fetch just starting suppresses immediately', () => {
    const map = new Map<string, number>()
    const { anyFirstRetryInFlight } = evaluateFreshness([q({ fetching: true })], NOW, map, WINDOW)
    expect(anyFirstRetryInFlight).toBe(true)
    expect(map.get('q')).toBe(NOW)
  })

  it('a fetch still in flight but past the suppress window stops suppressing', () => {
    const map = new Map<string, number>([['q', NOW - WINDOW - 1]])
    const { anyFirstRetryInFlight } = evaluateFreshness([q({ fetching: true })], NOW, map, WINDOW)
    expect(anyFirstRetryInFlight).toBe(false)
  })

  it('exactly at the window boundary still suppresses (inclusive)', () => {
    const map = new Map<string, number>([['q', NOW - WINDOW]])
    const { anyFirstRetryInFlight } = evaluateFreshness([q({ fetching: true })], NOW, map, WINDOW)
    expect(anyFirstRetryInFlight).toBe(true)
  })

  it('the hung-fetch scenario: one query never settles, others are old — stale still surfaces once the window elapses', () => {
    const map = new Map<string, number>([['hung', NOW - WINDOW - 1]])
    const hoursOld = NOW - 3 * 60 * 60 * 1000
    const { newestMs, anyFirstRetryInFlight } = evaluateFreshness(
      [
        q({ queryHash: 'hung', fetching: true, fetchFailureCount: 0 }),
        q({ queryHash: 'other', dataUpdatedAt: hoursOld }),
      ],
      NOW,
      map,
      WINDOW,
    )
    expect(newestMs).toBe(hoursOld)
    expect(anyFirstRetryInFlight).toBe(false)
    // Feeding that into isStaleAt now correctly reports stale instead of being
    // masked forever by the hung query.
    expect(isStaleAt(newestMs, NOW, 10_000, anyFirstRetryInFlight)).toBe(true)
  })

  it('a query that stopped fetching is forgotten, so a later fetch gets a fresh window', () => {
    const map = new Map<string, number>([['q', NOW - WINDOW - 1]])
    evaluateFreshness([q({ fetching: false })], NOW, map, WINDOW)
    expect(map.has('q')).toBe(false)
    // Next tick, a brand-new fetch on the same query starts its own window.
    const { anyFirstRetryInFlight } = evaluateFreshness([q({ fetching: true })], NOW + 1, map, WINDOW)
    expect(anyFirstRetryInFlight).toBe(true)
    expect(map.get('q')).toBe(NOW + 1)
  })

  it('a failed first attempt (fetchFailureCount > 0) never suppresses, matching pre-existing isStaleAt behaviour', () => {
    const map = new Map<string, number>()
    const { anyFirstRetryInFlight } = evaluateFreshness([q({ fetching: true, fetchFailureCount: 1 })], NOW, map, WINDOW)
    expect(anyFirstRetryInFlight).toBe(false)
  })

  it('newestMs picks the max across multiple data-bearing live queries', () => {
    const map = new Map<string, number>()
    const { newestMs } = evaluateFreshness(
      [
        q({ queryHash: 'a', dataUpdatedAt: NOW - 5000 }),
        q({ queryHash: 'b', dataUpdatedAt: NOW - 1000 }),
        q({ queryHash: 'c', dataUpdatedAt: NOW - 9000 }),
      ],
      NOW,
      map,
      WINDOW,
    )
    expect(newestMs).toBe(NOW - 1000)
  })

  // 2026-09-03: when the network drops, the active tab's next poll fails and flips
  // its query to 'error' — but the last good frame is still on screen, and its
  // dataUpdatedAt (only ever written on success) is that frame's true age. The old
  // status === 'success' gate skipped it, so going offline instantly AGED the
  // freshness stamp past the data actually showing (same class as the persist
  // snapshot bug). The snapshot no longer carries a status at all; a failing query
  // is one with fetchFailureCount > 0, and its dataUpdatedAt must still count.
  it('a live query whose latest poll FAILED still contributes its last good dataUpdatedAt', () => {
    const map = new Map<string, number>()
    const { newestMs } = evaluateFreshness(
      [
        q({ queryHash: 'erroring', dataUpdatedAt: NOW - 2000, fetching: true, fetchFailureCount: 3 }),
        q({ queryHash: 'old-success', dataUpdatedAt: NOW - 60 * 60 * 1000 }),
      ],
      NOW,
      map,
      WINDOW,
    )
    expect(newestMs).toBe(NOW - 2000)
  })
})

describe('isBoardStale — the board « Hors ligne » line', () => {
  const AWAKE = 10_000 // the active poll gear; isStaleAt floors the window at 90 s
  const NOW = 1_000_000
  const base = { isError: true, failureCount: 2, unauth: false, hasData: true, nowMs: NOW, gearMs: AWAKE }

  // THE REGRESSION (Marc, 2026-08-28). The board announced « Hors ligne · données de
  // 11:23 » at 11:23. Two failed polls is ~20 s and a phone banks pairs of them for
  // reasons that are not an outage — iOS aborts in-flight fetches when the web view
  // suspends, so an app-switch away and back produces two. Failures alone must never
  // carry a claim about how old the data is.
  it('does NOT claim offline while the data is a minute old', () => {
    expect(isBoardStale({ ...base, dataUpdatedAt: NOW - 60_000 })).toBe(false)
  })

  it('does not claim offline the instant two polls miss on fresh data', () => {
    expect(isBoardStale({ ...base, dataUpdatedAt: NOW - 20_000 })).toBe(false)
    expect(isBoardStale({ ...base, failureCount: 9, dataUpdatedAt: NOW - 1_000 })).toBe(false)
  })

  it('DOES claim offline once the data is genuinely old and polls are failing', () => {
    expect(isBoardStale({ ...base, dataUpdatedAt: NOW - 91_000 })).toBe(true)
  })

  it('holds its tongue on old data that is not failing — an idling kiosk is not an outage', () => {
    // A kiosk at the idle gear simply has not polled yet. Nothing is wrong.
    expect(isBoardStale({ ...base, isError: false, failureCount: 0, dataUpdatedAt: NOW - 600_000 })).toBe(false)
  })

  it('needs TWO misses, not one — a single blip on weak wifi self-heals', () => {
    expect(isBoardStale({ ...base, failureCount: 1, dataUpdatedAt: NOW - 600_000 })).toBe(false)
  })

  it('never fires with no frame to describe, nor on an auth failure', () => {
    // With no cached data the board shows its own empty/loading face; and a 401 is a
    // pairing problem with its own prompt, not an outage.
    expect(isBoardStale({ ...base, hasData: false, dataUpdatedAt: NOW - 600_000 })).toBe(false)
    expect(isBoardStale({ ...base, unauth: true, dataUpdatedAt: NOW - 600_000 })).toBe(false)
  })
})
