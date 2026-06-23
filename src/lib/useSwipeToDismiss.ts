import { useEffect, type RefObject } from 'react'

// Makes the grab handle real: drag a bottom sheet down to dismiss it. The
// gesture only arms when the sheet is scrolled to the very top AND the finger
// moves DOWN, so it never fights scrolling the sheet's own content. Past a
// distance threshold it animates out and calls onClose; otherwise it springs
// back. Attach the returned ref to the scrolling sheet element.
//
//   const ref = useRef<HTMLDivElement>(null)
//   useSwipeToDismiss(ref, onClose)              // unmount-on-close modal
//   useSwipeToDismiss(ref, onClose, { open })    // always-mounted .show sheet
//
// Pass `open` for sheets kept in the DOM (AddSheet/ProfilePicker): when they
// reopen we clear the leftover dismiss transform so the `.show` slide can run.

const DISMISS_PX = 110 // drag past this and the sheet leaves

export function useSwipeToDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { open = true }: { open?: boolean } = {},
): void {
  // Drop any leftover inline dismiss transform on EVERY open/close edge — not
  // just on reopen. On reopen it lets the `.show` slide-in run from rest. On
  // CLOSE it clears a half-finished drag transform: a rapid close mid-drag would
  // otherwise leave a partial inline `translateY(Npx)` + `transition:none` that
  // overrides — and FREEZES — the CSS slide-out (`.sheet` → translateY(110%)),
  // stranding the sheet half-open over the page (the iOS app-switch glitch).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = ''
    el.style.transition = ''
  }, [open, ref])

  useEffect(() => {
    const el = ref.current
    if (!el || !open) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let startY = 0
    let delta = 0
    let active = false
    // Set while a committed dismiss is animating out, so a background event can
    // finalize it (its transitionend/timer is paused once the tab is hidden).
    let finalizeDismiss: (() => void) | null = null

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      // A drag grip owns its own gesture (the pointer-DnD reorder/move): a
      // downward drag of a meal there must NOT also pan the sheet toward dismiss.
      const start = e.target instanceof HTMLElement ? e.target : null
      if (start?.closest('[data-dnd-grip]')) return
      // Don't arm the dismiss if the finger is over a nested scroller that can
      // still scroll UP (e.g. QuickAdd's `.qa__list`, scrolled partway down).
      // That downward drag belongs to content scrolling — without this check the
      // sheet's own scrollTop stays 0 (the inner list scrolls instead), so every
      // in-list pan looked like a dismiss and closed the whole panel.
      let n: HTMLElement | null = e.target instanceof HTMLElement ? e.target : null
      while (n && n !== el) {
        if (n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0) return
        n = n.parentElement
      }
      if (el.scrollTop > 0) return
      startY = e.touches[0].clientY
      delta = 0
      active = true
      el.style.transition = 'none'
    }
    const onMove = (e: TouchEvent) => {
      if (!active) return
      delta = e.touches[0].clientY - startY
      if (delta <= 0) {
        // Upward — give the gesture back to normal content scrolling.
        el.style.transform = ''
        el.style.transition = ''
        active = false
        return
      }
      e.preventDefault() // hijack the vertical pan to follow the finger
      el.style.transform = `translateY(${delta}px)`
    }
    const finish = () => {
      if (!active) return
      active = false
      el.style.transition = reduce ? 'none' : 'transform 0.22s ease'
      if (delta <= DISMISS_PX) {
        el.style.transform = '' // spring back to rest
        return
      }
      el.style.transform = 'translateY(110%)' // continue down, then close
      if (reduce) {
        onClose()
        return
      }
      let settled = false
      const done = (e?: TransitionEvent) => {
        if (settled || (e && e.propertyName !== 'transform')) return
        settled = true
        el.removeEventListener('transitionend', done)
        finalizeDismiss = null
        onClose()
      }
      finalizeDismiss = () => done()
      el.addEventListener('transitionend', done)
      window.setTimeout(done, 320) // fallback if transitionend is swallowed
    }

    // iOS can suspend the app mid-gesture (app-switcher, lock, rapid close):
    // touchend/touchcancel never arrive, so a drag freezes with a stale inline
    // translateY and `active` stuck on, and a committed dismiss's transitionend
    // + timer are paused. The sheet then returns frozen half-open over the page.
    // On hide: finalize a committed dismiss; otherwise snap an abandoned drag
    // back to rest so the sheet comes back clean.
    const abort = () => {
      if (finalizeDismiss) {
        finalizeDismiss()
        return
      }
      if (!active) return
      active = false
      el.style.transition = 'none'
      el.style.transform = ''
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') abort()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', finish)
    el.addEventListener('touchcancel', finish)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', abort)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', finish)
      el.removeEventListener('touchcancel', finish)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', abort)
    }
  }, [open, ref, onClose])
}
