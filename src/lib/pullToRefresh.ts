// Pull-to-refresh for the hub's one scroller (bmad/12 #17).
//
// Why it has to be built by hand here: the browser's own pull-to-refresh is
// structurally unavailable in this app. `html, body` are `overflow: hidden` with
// `overscroll-behavior: none` (hub.css — deliberately, so an iOS toolbar drag
// can't peel the whole 100vh shell behind the inner scroller), and `.hub__body`
// is the thing that actually scrolls. A document that never scrolls never
// overscrolls, so Chrome/Safari never offer the gesture. The one refresh
// affordance a phone user has muscle memory for simply did nothing.
//
// What it refreshes: nothing is passed a key list on purpose. `invalidateQueries()`
// with no filter marks everything stale but only REFETCHES active observers —
// which is exactly "what this tab is currently showing". A hand-maintained
// per-tab key map would be a second copy of queryKeys.ts that silently rots the
// first time a card is moved between tabs.
//
// Calm: no spinner that spins forever, no haptic, no "pulled 3 times today". The
// arrow turns over at the threshold and the row collapses when the data lands.
import { useCallback, useEffect, useRef, useState } from 'react'

// Everything below is in INDICATOR px (what you see), not finger px. The finger
// travels 1/RESISTANCE times further, which is the drag's weight: pulling feels
// like moving something, not like scrolling.
//
// How far the indicator must open before releasing refreshes. Long enough that a
// sloppy downward flick on a list already at the top doesn't refetch; short enough
// to reach with a thumb without shifting your grip.
export const PULL_THRESHOLD = 56
// It keeps giving past the threshold, but never far enough to shove the content
// into the middle of the screen.
const PULL_MAX = 96
const RESISTANCE = 0.5
// The refetch usually resolves in well under a frame from cache. Hold the
// indicator briefly anyway: a row that appears and vanishes in 30 ms reads as a
// glitch, not as "I heard you".
const MIN_SPIN_MS = 450

/**
 * Is there a vertically-scrollable element between `from` and the scroller
 * `stop` (exclusive)? If so the gesture belongs to it, not to the page.
 *
 * Deliberately conservative — it doesn't ask whether the inner list is at ITS
 * top. Chaining rules are subtle, several of these lists opt out of chaining
 * outright (`overscroll-behavior: contain`), and the cost of being wrong is
 * asymmetric: a missed pull-to-refresh is a shrug, a list that stops scrolling
 * under your thumb reads as a broken app.
 */
function hasScrollableAncestor(from: HTMLElement, stop: HTMLElement): boolean {
  for (let el: HTMLElement | null = from; el && el !== stop; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight) continue
    const oy = getComputedStyle(el).overflowY
    if (oy === 'auto' || oy === 'scroll') return true
  }
  return false
}

export interface PullState {
  /** Current drag distance in px (0 when idle). Drives the indicator's height. */
  pull: number
  /** The refetch is in flight (or inside its minimum visible window). */
  refreshing: boolean
  /** Dragged far enough that releasing now would refresh. */
  armed: boolean
}

/**
 * Attach pull-to-refresh to a scroller.
 *
 * @param ref      the scrolling element (`.hub__body`)
 * @param onRefresh what to re-fetch; awaited, so the indicator tracks the real work
 * @param enabled  false on a kiosk (no thumb) and while a modal owns the screen
 */
export function usePullToRefresh(
  ref: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled: boolean,
): PullState {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  // The handlers are attached once and read live values through refs, so a
  // re-render mid-drag never re-binds the listeners under the finger.
  const startY = useRef(0)
  const startX = useRef(0)
  const tracking = useRef(false)
  const engaged = useRef(false)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const run = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    const started = Date.now()
    try {
      await onRefreshRef.current()
    } catch {
      /* a failed refetch is Query's problem to show; the gesture still completes */
    }
    const left = MIN_SPIN_MS - (Date.now() - started)
    if (left > 0) await new Promise((r) => setTimeout(r, left))
    refreshingRef.current = false
    setRefreshing(false)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const onStart = (e: TouchEvent) => {
      tracking.current = false
      engaged.current = false
      if (refreshingRef.current || e.touches.length !== 1) return
      // Only from a genuine rest at the top. `> 0` and we're mid-scroll: the
      // gesture belongs to the list.
      if (el.scrollTop > 0) return
      // Never steal a drag handle's touch — usePointerDnd's grips set
      // `touch-action: none` precisely because they own the whole gesture.
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.dnd-grip, [data-dnd-zone] [draggable], .undo-toast')) return
      // …nor a NESTED scroller's. A capped list inside the page (Réglages' review
      // queue is `max-height: 50vh; overflow-y: auto`) owns any vertical drag that
      // starts in it, and several of them say so outright with
      // `overscroll-behavior: contain`. Without this, pulling such a list down while
      // the page happened to be at its top opened the refresh indicator AND
      // preventDefault'd the list's own scroll — the list simply stopped moving.
      if (hasScrollableAncestor(target, el)) return
      startY.current = e.touches[0].clientY
      startX.current = e.touches[0].clientX
      tracking.current = true
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking.current) return
      const dy = e.touches[0].clientY - startY.current
      const dx = e.touches[0].clientX - startX.current
      // Upward, or mostly sideways (a Rail / SubTabs swipe living inside the
      // body) → this was never a pull. Give up for the rest of the gesture.
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        if (!engaged.current) tracking.current = false
        return
      }
      if (!engaged.current) {
        if (dy < 8) return // slop, so a tap never nudges the indicator
        engaged.current = true
      }
      // Once engaged we own the gesture: without preventDefault the scroller
      // would ALSO rubber-band, and the indicator would fight the content.
      if (e.cancelable) e.preventDefault()
      setPull(Math.min(PULL_MAX, dy * RESISTANCE))
    }

    const finish = () => {
      const wasEngaged = engaged.current
      tracking.current = false
      engaged.current = false
      if (!wasEngaged) return
      setPull((cur) => {
        if (cur >= PULL_THRESHOLD) void run()
        return 0
      })
    }

    // passive:false on move only — that's the one that calls preventDefault.
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', finish, { passive: true })
    el.addEventListener('touchcancel', finish, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', finish)
      el.removeEventListener('touchcancel', finish)
    }
  }, [ref, enabled, run])

  return { pull, refreshing, armed: pull >= PULL_THRESHOLD }
}
