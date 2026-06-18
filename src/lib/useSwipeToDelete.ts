import { useEffect, useRef, type RefObject } from 'react'

// Swipe a list row LEFT to delete it (Outlook-mobile style). The gesture arms
// only when the first move is clearly horizontal-and-leftward, so it never
// steals vertical list scrolling or the row's own taps. The foreground element
// (the ref) follows the finger, revealing a red delete pane behind it; released
// past a threshold it slides fully out and calls onDelete, otherwise it springs
// back to rest.
//
//   const ref = useRef<HTMLDivElement>(null)   // the sliding foreground (.list-row__main)
//   useSwipeToDelete(ref, () => remove(item))
//
// onDelete fires AFTER the slide-out animation, so the caller can remove the row
// (e.g. via an undo toast) and let it unmount once it's already off-screen.

const ARM_PX = 8 // movement before we commit to an axis
const H_DOMINANCE = 1.5 // arm horizontal only when |dx| clearly beats |dy| by this factor
const COMMIT_FRACTION = 0.35 // swipe past this share of the row width to delete
const COMMIT_MIN_PX = 90 // …but always at least this far

export function useSwipeToDelete(ref: RefObject<HTMLElement | null>, onDelete: () => void): void {
  // Keep the latest callback in a ref so a parent re-render (the board polls a
  // few times a minute) can't tear the listeners down — and reset the transform —
  // in the middle of a live swipe.
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let startX = 0
    let startY = 0
    let dx = 0
    let axis: 'undecided' | 'horizontal' | 'vertical' = 'undecided'

    const reset = () => {
      el.style.transition = ''
      el.style.transform = ''
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      dx = 0
      axis = 'undecided'
      el.style.transition = 'none'
    }
    const onMove = (e: TouchEvent) => {
      const ddx = e.touches[0].clientX - startX
      const ddy = e.touches[0].clientY - startY
      if (axis === 'undecided') {
        if (Math.abs(ddx) < ARM_PX && Math.abs(ddy) < ARM_PX) return
        // Vertical-biased axis lock — the gesture is a SCROLL unless it's plainly a
        // flat leftward swipe. Arm horizontal only when ALL hold: it's leftward,
        // vertical travel is still under the arm threshold (a real scroll crosses
        // it almost immediately), and |dx| clearly beats |dy|. The vertical-cap is
        // the load-bearing part: a fast scroll's first touchmove can land already
        // large on BOTH axes (e.g. dx=-40, dy=20) — a ratio test alone passes that
        // and flashes the red delete pane on every row you scroll past. Requiring
        // |dy| < ARM_PX means any meaningful vertical travel locks scroll first.
        const flatSwipe =
          ddx < 0 && Math.abs(ddy) < ARM_PX && Math.abs(ddx) > Math.abs(ddy) * H_DOMINANCE
        axis = flatSwipe ? 'horizontal' : 'vertical'
        if (axis === 'vertical') reset()
      }
      if (axis !== 'horizontal') return
      e.preventDefault() // hijack the horizontal pan to follow the finger
      dx = Math.min(0, ddx) // left only; never drag past the right edge
      el.style.transform = `translateX(${dx}px)`
    }
    const finish = () => {
      if (axis !== 'horizontal') {
        axis = 'undecided'
        return
      }
      axis = 'undecided'
      const threshold = Math.max(COMMIT_MIN_PX, el.offsetWidth * COMMIT_FRACTION)
      el.style.transition = reduce ? 'none' : 'transform 0.2s ease'
      if (-dx <= threshold) {
        el.style.transform = '' // not far enough — spring back
        return
      }
      el.style.transform = 'translateX(-110%)' // slide out, then delete
      if (reduce) {
        onDeleteRef.current()
        return
      }
      let settled = false
      const done = (ev?: TransitionEvent) => {
        if (settled || (ev && ev.propertyName !== 'transform')) return
        settled = true
        el.removeEventListener('transitionend', done)
        onDeleteRef.current()
      }
      el.addEventListener('transitionend', done)
      window.setTimeout(done, 300) // fallback if transitionend is swallowed
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', finish)
    el.addEventListener('touchcancel', finish)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', finish)
      el.removeEventListener('touchcancel', finish)
    }
  }, [ref])
}
