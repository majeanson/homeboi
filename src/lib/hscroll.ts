import { useCallback, useEffect, useRef, useState } from 'react'
import { scrollBehavior } from './motion'

// useHScroll — makes a horizontally-scrolling row reachable with a MOUSE.
//
// The app hides the scrollbar on every side-scrolling row (`.subtabs`, `.rail`,
// `.operator__tabs`, the birthday strip, the DrawPad tool bars) because a grey
// rail under a pill row is noise on a wall tablet. On a touch screen that costs
// nothing — you swipe the row. On a desktop it silently HIDES CONTENT: a mouse
// wheel only ever emits `deltaY`, and no browser maps that onto a horizontal
// scroller, so with no scrollbar and no drag there is literally no way to reach
// what's past the right edge. That's how Réglages ▸ Régler ▸ Système's nine subs
// (« Tablettes jumelées » … « Diagnostics ») became unclickable on desktop.
//
// This hook is the one fix: attach `ref` to the scroller and it
//   • maps a vertical wheel onto horizontal scroll (only while the row overflows,
//     and it hands the wheel back to the page at either end so it's never trapped),
//   • reports `overflowing` / `atStart` / `atEnd` so a caller can render an
//     affordance (SubTabs draws ‹ › chevrons),
//   • offers `page()` to step one screenful and `toView()` to bring a child in.
//
// It changes no DOM and no layout on its own, so it's safe to attach to any
// existing row. Touch/trackpad behaviour is untouched — a trackpad already emits
// `deltaX`, which the browser scrolls natively, so we leave those events alone.

// A chevron press / one wheel page moves this fraction of the visible width.
const PAGE_FRACTION = 0.8
// `WheelEvent.deltaMode === 1` reports LINES, not pixels (Firefox, some mice).
const LINE_PX = 16

export interface HScroll<T extends HTMLElement> {
  ref: React.RefObject<T | null>
  // True when there is anything to scroll to. Gate affordances on this — a row
  // that fits must not grow chevrons.
  overflowing: boolean
  atStart: boolean
  atEnd: boolean
  // Step one screenful left (-1) or right (1).
  page: (dir: -1 | 1) => void
  // Scroll a child fully into view horizontally, without moving the page.
  toView: (child: Element | null, instant?: boolean) => void
}

export function useHScroll<T extends HTMLElement = HTMLDivElement>(): HScroll<T> {
  const ref = useRef<T>(null)
  const [state, setState] = useState({ overflowing: false, atStart: true, atEnd: true })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // 1px slack: sub-pixel layout rounding otherwise reports a permanent 0.5px
    // overflow and pins `atEnd` false forever.
    const next = { overflowing: max > 1, atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= max - 1 }
    // Stamp the state onto the DOM so CSS can draw the EDGE FADE — the cue that
    // says "this row continues". The chevrons only show on a fine pointer, so a
    // phone had no hint at all that a rail was cut off (UX review 2026-07-14: the
    // Réglages tab rail hid five tabs, a sort chip read as « R… »). Every row that
    // adopts this hook gets the cue for free — nothing to wire per caller.
    el.toggleAttribute('data-hs', next.overflowing)
    el.toggleAttribute('data-hs-start', next.overflowing && !next.atStart)
    el.toggleAttribute('data-hs-end', next.overflowing && !next.atEnd)
    setState((prev) =>
      prev.overflowing === next.overflowing && prev.atStart === next.atStart && prev.atEnd === next.atEnd
        ? prev
        : next,
    )
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      const el = ref.current
      if (!el) return
      // A trackpad's sideways swipe already carries deltaX and the browser scrolls
      // it natively; ctrl+wheel is pinch-zoom. Only a plain vertical wheel — the
      // mouse case — needs translating.
      if (e.deltaY === 0 || e.deltaX !== 0 || e.ctrlKey) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 1) return // nothing to scroll: let the page have the wheel
      const dy = e.deltaY * (e.deltaMode === 1 ? LINE_PX : 1)
      // At either end, DON'T swallow the event — otherwise the row becomes a wheel
      // trap and the page can't scroll past it.
      if ((dy < 0 && el.scrollLeft <= 0) || (dy > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      el.scrollLeft += dy
    }

    // Native listener, not React's `onWheel`: React attaches wheel at the root as a
    // PASSIVE listener, where `preventDefault()` is a no-op (and logs a warning).
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', measure, { passive: true })

    // The row overflows when its CONTENT outgrows it, which an element-only
    // ResizeObserver never sees — so watch the children too, and re-watch them when
    // the option list changes (tabs are added/removed per section).
    let ro: ResizeObserver | undefined
    let mo: MutationObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      const watchAll = () => {
        ro!.disconnect()
        ro!.observe(el)
        for (const child of Array.from(el.children)) ro!.observe(child)
      }
      watchAll()
      if (typeof MutationObserver !== 'undefined') {
        mo = new MutationObserver(() => {
          watchAll()
          measure()
        })
        mo.observe(el, { childList: true })
      }
    }
    measure()

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [measure])

  const page = useCallback((dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * PAGE_FRACTION), behavior: scrollBehavior() })
  }, [])

  const toView = useCallback((child: Element | null, instant = false) => {
    const el = ref.current
    if (!el || !child) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 1) return
    // Measured against the scroller's own box (not offsetParent, which for `.subtabs`
    // is some unpositioned ancestor) and applied with scrollTo, so the PAGE never
    // moves — `child.scrollIntoView()` would also scroll every ancestor.
    const c = child.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const left = el.scrollLeft + (c.left - box.left) - (box.width - c.width) / 2
    el.scrollTo({
      left: Math.max(0, Math.min(max, left)),
      behavior: instant ? 'auto' : scrollBehavior(),
    })
  }, [])

  return { ref, ...state, page, toView }
}
