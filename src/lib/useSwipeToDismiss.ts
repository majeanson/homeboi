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
  // Reset any dismiss transform when an always-mounted sheet reopens.
  useEffect(() => {
    const el = ref.current
    if (el && open) {
      el.style.transform = ''
      el.style.transition = ''
    }
  }, [open, ref])

  useEffect(() => {
    const el = ref.current
    if (!el || !open) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let startY = 0
    let delta = 0
    let active = false

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
        onClose()
      }
      el.addEventListener('transitionend', done)
      window.setTimeout(done, 320) // fallback if transitionend is swallowed
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
  }, [open, ref, onClose])
}
