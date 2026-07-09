import { useEffect, useRef } from 'react'

// The ONE shared long-press gesture (P2-x). Three bespoke holds already existed —
// `usePointerDnd`'s `holdMs` (lib/dnd, arms a drag), `useTapToHearListener`
// (lib/tapToHear, speaks a row) and `KidExitGate` (a 3 s exit hold) — each
// re-solving the same three hard parts: abort on finger travel, suppress the OS
// context menu, and swallow the ONE click the lifting finger still fires.
// This folds that into a shell-level listener you point at a selector.
//
// Why window-level and not an `onPointerDown` per element: the board's edit mode
// arms on a press anywhere on ANY card, and a card's subtree is arbitrary
// (rows, links, note bodies). One capture listener + `closest(targets)` beats
// threading a handler through 21 card components. Same shape as tapToHear.
//
// Defensive scoping — a long-press must NEVER fight an interaction that already
// owns the pointer or the gesture:
//   • form fields (a hold = text selection / caret)   → excluded by default
//   • an existing drag grip (usePointerDnd)           → excluded by default
//   • an open modal / tour spotlight                  → bail out entirely
//   • scrolling → passive listeners, never preventDefault on move; >MOVE_PX of
//     travel or a pointercancel aborts the hold
//
// The `onLongPress` callback receives the matched target element, so a caller can
// read a `data-` attribute off it (the board reads the card id).

// A deliberate hold: longer than `DND_HOLD_MS` (400 ms, which only arms a drag on a
// grip you already meant to grab) and shorter than KidExitGate's 3 s escape hatch.
export const LONG_PRESS_MS = 500
const MOVE_PX = 8

// Anything that owns a press for its own purpose. Callers may extend, not replace.
const BASE_EXCLUDE = 'input, textarea, select, [contenteditable="true"], [data-dnd-grip], .kid-exit-switch'
// An overlay owns the press: a dialog backdrop or the guided-tour spotlight.
const OVERLAY = '.kit-modal__backdrop, .tour'

export function useLongPress(opts: {
  /** CSS selector for the element a press must land inside (walked up from the target). */
  targets: string
  /** Fired once the hold completes, with the matched target element. */
  onLongPress: (el: HTMLElement, e: PointerEvent) => void
  /** Bind the listeners at all. Default true. */
  enabled?: boolean
  /** Extra selector to ignore, appended to the base exclusions. */
  exclude?: string
  holdMs?: number
}): void {
  const enabled = opts.enabled ?? true
  // Latest callback/selectors without re-binding the listeners on every render.
  const cb = useRef(opts)
  cb.current = opts

  useEffect(() => {
    if (!enabled) return
    let timer: number | null = null
    let x0 = 0
    let y0 = 0
    const clear = () => {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
    }
    const excluded = (el: Element): boolean => {
      const extra = cb.current.exclude
      return !!el.closest(extra ? `${BASE_EXCLUDE}, ${extra}` : BASE_EXCLUDE)
    }
    const match = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null
      const el = target.closest(cb.current.targets)
      if (!el || !(el instanceof HTMLElement) || excluded(target)) return null
      return el
    }
    // One-shot, capture-phase: the lifting finger still fires a click after the hold
    // has already acted — swallow exactly that one so the press never ALSO activates
    // the row underneath. Self-removing, with a timeout in case no click ever comes.
    const suppressClick = (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      window.removeEventListener('click', suppressClick, true)
    }
    const down = (e: PointerEvent) => {
      clear()
      if (e.button !== 0) return // primary presses only (touch/pen report 0)
      const el = match(e.target)
      if (!el) return
      if (document.querySelector(OVERLAY)) return
      x0 = e.clientX
      y0 = e.clientY
      timer = window.setTimeout(() => {
        timer = null
        cb.current.onLongPress(el, e)
        window.addEventListener('click', suppressClick, true)
        window.setTimeout(() => window.removeEventListener('click', suppressClick, true), 900)
      }, cb.current.holdMs ?? LONG_PRESS_MS)
    }
    const move = (e: PointerEvent) => {
      // Finger travel = a scroll, never a hold. NEVER preventDefault here — the
      // hub body's native scroll must survive a press that turns into a flick.
      if (timer != null && Math.hypot(e.clientX - x0, e.clientY - y0) > MOVE_PX) clear()
    }
    // A hold on a link/image also arms the OS context menu (Android) — suppress it
    // only on our targets, the same trick tapToHear and the exit switch use.
    const context = (e: Event) => {
      if (match(e.target)) e.preventDefault()
    }
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', clear, { passive: true })
    window.addEventListener('pointercancel', clear, { passive: true })
    window.addEventListener('contextmenu', context)
    return () => {
      clear()
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
      window.removeEventListener('contextmenu', context)
      window.removeEventListener('click', suppressClick, true)
    }
  }, [enabled])
}
