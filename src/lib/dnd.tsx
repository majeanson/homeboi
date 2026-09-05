import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

// Pointer-based drag-and-drop that works on TOUCH (kiosk + phone) where native
// HTML5 drag events never fire. A drag carries a string id; drop targets are any
// element marked `data-dnd-zone="<key>"` under the pointer at release. The caller
// decides what a drop means — reschedule a meal to a day/slot, reorder a list…
//
// Design choices that make it feel right on a finger:
//  • a movement THRESHOLD before the drag visually engages, so a tap still works
//    and a tiny wobble doesn't start a drag;
//  • the caller puts `touch-action: none` on the drag handle (see .dnd-grip /
//    .dnd-source-grab) so the browser doesn't steal the gesture to scroll;
//  • while a drag is live we preventDefault on pointermove (non-passive) so the
//    page never scrolls out from under the drop — and, because that also takes
//    away the ONLY way to reach something off-screen, we scroll it ourselves
//    when the finger nears an edge (see « Edge auto-scroll » below);
//  • a floating ghost label follows the finger, because the finger itself covers
//    the row being dragged.
//
// One household tenet shows up here too: the hit-test walks UP from the pointer to
// the nearest zone, so a zone can hold rows that are themselves zones (drop "on a
// meal" reads as "into that meal's slot").
//
// ── THE THREE DROP CUES ─────────────────────────────────────────────────────────
// A drop only ever means one of three things, and the cue says WHICH before you let
// go — that is the whole contract, and it is the same on every surface:
//
//   'before'  a line on the item's LEADING edge   — lands in the gap before it
//   'after'   a line on the item's TRAILING edge  — lands in the gap after it
//   'into'    a dotted outline around the whole thing — goes INSIDE it
//
// Which one you get is decided by the POINTER, not by which direction you dragged
// from. A zone declares itself a reorder target with `data-dnd-insert="x"` (a row
// of cards: leading/trailing read left/right) or `"y"` (a column of rows:
// top/bottom); the pointer's position within that element's box then picks
// before-vs-after. A zone WITHOUT the attribute is a container — a meal slot, a
// family slot, a group — and always reads 'into'.
//
// This replaced a direction heuristic ("you came from above, so you'll land
// below"). It was re-derived three different ways across the app and, crucially,
// could not express "after the LAST one": every gap but the final one was
// reachable. On the board that made « Demain » impossible to drop to the right of
// « Aujourd'hui » while the reverse worked fine, because the only way to land at
// the end was to hit the zone's trailing empty space — and a full band row has
// none.

export interface DragGhostState {
  label: string
  x: number
  y: number
}

/** Where, within a reorder zone, the pointer is — or `null` for a container drop. */
export type DropEdge = 'before' | 'after' | null
/** What releasing here would do. See « THE THREE DROP CUES » above. */
export type DropCue = 'before' | 'after' | 'into'

// Default long-press delay (ms) for the hold-to-drag mode — deliberate enough that
// a tap or scroll-flick on the handle never starts an accidental move.
export const DND_HOLD_MS = 400

// ── Edge auto-scroll ──────────────────────────────────────────────────────────────
// A live drag preventDefaults every pointermove, so the page cannot scroll under
// the drop. That is right — but it also meant a card at the top of a long board
// could only be moved down one screenful at a time, dropping and re-grabbing at
// each step. So the drag scrolls the page itself: hold the finger near the top or
// bottom edge of the scrolling container and it pans, faster the closer you are.
//
// Deliberately NOT gated on `prefers-reduced-motion`: this is not decoration, it is
// the only way to reach an off-screen target while dragging. Taking it away would
// make the gesture unfinishable rather than calmer.
const EDGE_MIN = 48
const EDGE_MAX = 120
const EDGE_FRACTION = 0.15
const SPEED_MAX = 18

/** The nearest ancestor that can actually scroll vertically. `.hub__body` and
 *  `#root` are the app's real scrollers (`body`/`html` are `overflow:hidden` —
 *  see the note in lib/useModal), so the walk normally stops at one of them. */
function scrollerFor(el: Element | null): HTMLElement | null {
  let n = el as HTMLElement | null
  while (n && n !== document.body) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY
      if (oy === 'auto' || oy === 'scroll') return n
    }
    n = n.parentElement
  }
  return null
}

/** How deep into an edge band `y` is, as px/frame: 0 in the neutral middle, ramping
 *  to SPEED_MAX at the very edge. Negative = up.
 *
 *  The `* 0.3` clamp is not cosmetic: on a SHORT scroller a fixed 48px floor at each
 *  end would leave almost no neutral middle (a 100px-tall list would be 4px of "hold
 *  still" between two auto-scrolling bands), so holding anywhere in it would pan the
 *  list out from under you. Capping each band at 30% of the height always leaves a
 *  real middle to aim at. */
export function edgeSpeed(y: number, rect: { top: number; bottom: number; height: number }): number {
  const band = Math.min(EDGE_MAX, Math.max(EDGE_MIN, rect.height * EDGE_FRACTION), rect.height * 0.3)
  const fromTop = y - rect.top
  const fromBottom = rect.bottom - y
  if (fromTop < band) return -SPEED_MAX * (1 - Math.max(0, fromTop) / band)
  if (fromBottom < band) return SPEED_MAX * (1 - Math.max(0, fromBottom) / band)
  return 0
}

/**
 * The whole auto-scroll rule, pure and DOM-free so it can be reasoned about and
 * tested without a browser (same split as lib/widgetGrid's geometry).
 *
 * `armed` is the latch, and it is the entire difference between "helpful" and
 * "infuriating". Grabbing a card that ALREADY sits near an edge must not fly the page
 * away — you asked to move a card, not to scroll — so nothing pans until the finger
 * has been in the neutral middle at least once. A drag that starts mid-screen is armed
 * by its very first move, so dragging TO the edge pans immediately, which is the point.
 */
export function autoScrollStep(
  y: number,
  rect: { top: number; bottom: number; height: number },
  armed: boolean,
): { dy: number; armed: boolean } {
  const speed = edgeSpeed(y, rect)
  if (speed === 0) return { dy: 0, armed: true } // in the neutral middle → arm it
  return { dy: armed ? speed : 0, armed }
}

export function usePointerDnd(opts: {
  /** `edge` says WHERE within the zone the pointer was — `'before'`/`'after'` for a
   *  reorder zone (one that declares `data-dnd-insert`), `null` for a container. */
  onDrop: (id: string, zone: string, edge: DropEdge) => void
  // Reject a drop (e.g. onto its own day/slot) — also greys the zone out so it
  // never shows a drop cue it won't honour.
  canDrop?: (id: string, zone: string) => boolean
  // Require a press-and-HOLD of this many ms before the drag engages (touch-
  // friendly: moving the finger before it fires reads as a scroll/tap and aborts).
  // Omit/0 → the classic engage-once-moved-past-a-6px-threshold behaviour.
  holdMs?: number
}) {
  // The session (id + label) is set once at start; position ticks on every move.
  // Splitting them keeps the window listeners bound once per drag, not per pixel.
  const [session, setSession] = useState<{ id: string; label: string } | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [started, setStarted] = useState(false)
  const [over, setOver] = useState<string | null>(null)
  const [overEdge, setOverEdge] = useState<DropEdge>(null)
  const originRef = useRef<{ started: boolean; sx: number; sy: number } | null>(null)
  // The scroller the drag STARTED in — the auto-scroll's fallback when the pointer is
  // over something that isn't inside one. That is not a corner case: the hub's bottom
  // tab bar OVERLAYS the scroller's own bottom edge, so the whole lower auto-scroll
  // band sits under the nav. Resolving only from the element under the pointer found
  // the nav (which scrolls nothing) and the board simply refused to pan.
  const originScrollerRef = useRef<HTMLElement | null>(null)
  // Latest callbacks without re-binding the listeners.
  const cb = useRef(opts)
  cb.current = opts

  /** The zone under (x, y), plus which side of it — resolved together, because the
   *  edge is a property of the element we just hit-tested, not of the drag. */
  const zoneAt = (x: number, y: number): { key: string; edge: DropEdge } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const zone = el?.closest('[data-dnd-zone]') as HTMLElement | null
    const key = zone?.dataset.dndZone
    if (!zone || key == null) return null
    const axis = zone.dataset.dndInsert
    if (axis !== 'x' && axis !== 'y') return { key, edge: null } // a container drop
    const r = zone.getBoundingClientRect()
    const past = axis === 'x' ? x - r.left > r.width / 2 : y - r.top > r.height / 2
    return { key, edge: past ? 'after' : 'before' }
  }

  useEffect(() => {
    if (!session) return
    const holdMs = cb.current.holdMs ?? 0
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    // Last pointer position, so the auto-scroll loop can re-hit-test a still finger.
    const at = { x: 0, y: 0 }
    let raf = 0
    // Auto-scroll ARMS only once the finger has been outside the edge bands. Grabbing
    // a card that already sits near the top of the screen would otherwise fly the page
    // away the instant the drag engages — you asked to move a card, not to scroll — and
    // it is the single most common way edge auto-scroll is got wrong. Leave the band
    // once and it is live for the rest of the drag.
    let armed = false
    const clearHold = () => {
      if (holdTimer != null) {
        clearTimeout(holdTimer)
        holdTimer = null
      }
    }
    const stopScroll = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    // Both setters bail when unchanged, so a held finger doesn't re-render per frame.
    const readZone = () => {
      const z = zoneAt(at.x, at.y)
      const ok = z != null && (!cb.current.canDrop || cb.current.canDrop(session.id, z.key))
      setOver((prev) => (prev === (ok ? z!.key : null) ? prev : ok ? z!.key : null))
      setOverEdge((prev) => {
        const next = ok ? z!.edge : null
        return prev === next ? prev : next
      })
    }
    // One rAF loop, alive only while the finger sits in an edge band.
    const scroller = () => scrollerFor(document.elementFromPoint(at.x, at.y)) ?? originScrollerRef.current
    /** One step of the rule against the live scroller; also updates the latch. */
    const step = () => {
      const sc = scroller()
      if (!sc) return { sc: null, dy: 0 }
      const next = autoScrollStep(at.y, sc.getBoundingClientRect(), armed)
      armed = next.armed
      return { sc, dy: next.dy }
    }
    const tick = () => {
      raf = 0
      const { sc, dy } = step()
      if (!sc || dy === 0) return
      const before = sc.scrollTop
      sc.scrollTop = before + dy
      if (sc.scrollTop === before) return // already at the end — nothing to chase
      readZone() // the content moved under a still finger; the cue must follow it
      raf = requestAnimationFrame(tick)
    }
    const maybeScroll = () => {
      if (step().dy !== 0 && !raf) raf = requestAnimationFrame(tick)
    }
    const finish = (e: PointerEvent, commit: boolean) => {
      clearHold()
      stopScroll()
      const o = originRef.current
      if (commit && o?.started) {
        const z = zoneAt(e.clientX, e.clientY)
        if (z != null && (!cb.current.canDrop || cb.current.canDrop(session.id, z.key)))
          cb.current.onDrop(session.id, z.key, z.edge)
      }
      originRef.current = null
      setSession(null)
      setStarted(false)
      setOver(null)
      setOverEdge(null)
    }
    // Hold-to-drag: arm the drag only once the finger has rested for holdMs.
    if (holdMs > 0) {
      holdTimer = setTimeout(() => {
        const o = originRef.current
        if (!o) return
        o.started = true
        setStarted(true)
      }, holdMs)
    }
    const move = (e: PointerEvent) => {
      const o = originRef.current
      if (!o) return
      if (!o.started) {
        const movedFar = Math.abs(e.clientX - o.sx) >= 6 || Math.abs(e.clientY - o.sy) >= 6
        if (holdMs > 0) {
          // Moving before the hold fires = a scroll/tap, not a drag — abort so the
          // gesture falls through to the page (and the finger never half-engages).
          if (movedFar) finish(e, false)
          return
        }
        // Classic mode: engage once the finger clears the movement threshold.
        if (!movedFar) return
        o.started = true
        setStarted(true)
      }
      e.preventDefault()
      at.x = e.clientX
      at.y = e.clientY
      setPos({ x: at.x, y: at.y })
      readZone()
      maybeScroll()
    }
    const up = (e: PointerEvent) => finish(e, true)
    const cancel = (e: PointerEvent) => finish(e, false)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      clearHold()
      stopScroll()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [session])

  const start = useCallback((id: string, label: string, e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    originRef.current = { started: false, sx: e.clientX, sy: e.clientY }
    originScrollerRef.current = scrollerFor(e.target as Element)
    setSession({ id, label })
    setPos({ x: e.clientX, y: e.clientY })
    setStarted(false)
  }, [])

  return {
    start,
    // The dragged id, but only after the threshold — so source styling and the
    // ghost don't flash on a plain tap.
    activeId: started && session ? session.id : null,
    over,
    overEdge,
    ghost: started && session ? { label: session.label, x: pos.x, y: pos.y } : null,
  }
}

// What releasing over THIS zone would do — the one place every surface asks. Null
// unless something ELSE is actively being dragged over it, so a row never cues a
// move onto its own slot.
//
// `isSelf` defaults to the plain index-keyed case (`id === activeId`). A compound
// zone key has to say so itself: the board's slots are keyed `«zone»:«cardId»`
// while the drag carries the bare card id, so `CardSlot` passes its own comparison.
//
// The pointer decides 'before' vs 'after' (see « THE THREE DROP CUES »); a zone
// that declared no insert axis is a container and reads 'into'.
export function dropCueOf(
  dnd: { activeId: string | null; over: string | null; overEdge: DropEdge },
  id: string,
  isSelf = dnd.activeId === id,
): DropCue | null {
  if (dnd.over !== id || dnd.activeId == null || isSelf) return null
  return dnd.overEdge ?? 'into'
}

/** The cue's physical edge class for a host laid out along `axis`. 'into' has no
 *  line — it wears the dotted `.dnd-over` outline instead. */
export function dropEdgeClass(cue: DropCue | null, axis: 'x' | 'y'): string | null {
  if (cue == null || cue === 'into') return null
  if (axis === 'x') return cue === 'before' ? 'left' : 'right'
  return cue === 'before' ? 'top' : 'bottom'
}

// The floating label that trails the finger. Render once per page using the hook.
// Portalled to <body> so `position: fixed` stays viewport-relative even when an
// ancestor is transformed (the day sheet animates with translateY — a fixed child
// inside it would otherwise anchor to the sheet, not the screen).
export function DragGhost({ ghost }: { ghost: DragGhostState | null }) {
  if (!ghost) return null
  return createPortal(
    <div className="dnd-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
      {ghost.label}
    </div>,
    document.body,
  )
}
