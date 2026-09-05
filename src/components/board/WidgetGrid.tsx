import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { zoneKey, type BoardCardId, type CardZone } from '../../lib/boardCards'
import { colsFor, isNarrow } from '../../lib/widgetGrid'
import { type DropEdge } from '../../lib/dnd'

// The board's widget-space layout engine. ONE component, used once per zone (the pinned
// band, then the masonry) — which is what makes "drag a card from the band into the grid"
// a single coherent gesture instead of two systems talking past each other.
//
// WHY NOT CSS MULTI-COLUMN (what the board used to be):
// `columns: 300px` gave true masonry for free — a short tile lets the next one rise into
// the gap beneath it, which a plain CSS grid can't do (a grid row is as tall as its
// tallest cell, stranding dead space under every short card). But multi-column offers
// exactly two widths: one column, or `column-span: all`. No 2-of-4 widget. And it
// re-flows cards between columns as you drag, which reads as chaos.
//
// WHY CSS GRID + MEASURED ROW SPANS:
// Rows are a fine 8px ruler (`grid-auto-rows`). Each card measures its natural content
// height and claims `grid-row-end: span N`, so it occupies only the rows it needs — that
// restores the no-dead-gaps property — while `grid-column-end: span M` finally gives real
// widget widths. Card positions are stable slots, so a drag lands where the eye expects.
//
// THE SPAN ARITHMETIC (easy to get wrong): a grid item spanning N rows also covers the
// N-1 row-gaps between them, so its usable height is `N*ROW + (N-1)*GAP`. Solving for the
// smallest N that fits a content height h gives `N = ceil((h + GAP) / (ROW + GAP))`. The
// row-gap left over after the item is what draws the gutter — so DON'T also give cards a
// bottom margin, or the rhythm doubles.
//
// `grid-auto-flow: dense` is what backfills the holes a short card leaves. The trade-off
// is real and deliberate: dense may pull a later card up into an earlier gap, so the
// visual order can depart from the stored order. That is the price of masonry-with-spans;
// without it you get grid's dead gaps back. If it ever reads wrong on the wall, drop the
// `dense` keyword in widget-grid.css and accept ragged bottoms — nothing else changes.
//
// Columns are counted in JS rather than left to `repeat(auto-fill, minmax(...))`, because
// a card's size must be CLAMPED to the count (a size-3 widget on a one-column phone has to
// render span-1, not overflow). `lib/boardCards.clampSize` does that; it needs the number.

// The geometry itself (row spans, column counts, and the constants that must mirror
// widget-grid.css) lives in lib/widgetGrid — pure, and unit-tested without a DOM.

export interface WidgetGridCtx {
  zone: CardZone
  /** Live column count — the clamp every card's size is measured against. */
  cols: number
  /** The grid's own measured pixel width — what `cols`/`narrow` were derived from.
   *  A `CardSlot` reads this (with its own span) to compute `lib/widgetGrid.isCompact`
   *  for the compact lens; nothing else should need it (prefer `cols`/`narrow`). */
  width: number
  /** Phone-shaped (by MEASURED width, never by `surface`). Its two columns exist so a
   *  card can opt into a half; an un-sized card still renders full width. */
  narrow: boolean
  /** Edit mode is armed on this grid (long-press, or ?edit=1). */
  editing: boolean
  /** The ONE drag session, shared by both zones — which is what lets a card be dragged
   *  out of the band and into the masonry. Null outside edit mode. */
  dnd: PointerDnd | null
  /** The compact lens's expand state (Phase 3): which card, if any, is temporarily
   *  grown to this zone's full width. Lifted to Board.tsx and threaded into BOTH zone
   *  mounts (same trick as `dnd`) so single-open holds across the band AND the grid,
   *  not just within one. Null when nothing is expanded. */
  expandedId: BoardCardId | null
  /** Grow `id` to full width; collapses whatever else was expanded (single-open). */
  onExpand: (id: BoardCardId) => void
  /** Shrink whatever is expanded back to its compact form. */
  onCollapse: () => void
}

/** The shape `usePointerDnd` returns (lib/dnd). Typed structurally to keep this file
 *  from importing the hook just for its return type. */
export interface PointerDnd {
  start: (id: string, label: string, e: ReactPointerEvent) => void
  activeId: string | null
  over: string | null
  /** Which side of the hovered slot the pointer is on — `dropCueOf` reads it. */
  overEdge: DropEdge
}

// `zoneKey` / `parseZoneKey` live in lib/boardCards — the key format is a data concern,
// and the Réglages list needs it too without importing a React component.

// Stable no-op defaults so a caller that doesn't care about expand (there is none
// today — Board.tsx always passes real ones — but /dev/kit or a future standalone
// use might) doesn't churn the context value's identity every render.
const NOOP_EXPAND = () => {}
const NOOP_COLLAPSE = () => {}

const Ctx = createContext<WidgetGridCtx | null>(null)

/** Read the grid a card sits in. Null outside a WidgetGrid (a card rendered standalone). */
export const useWidgetGrid = (): WidgetGridCtx | null => useContext(Ctx)

export function WidgetGrid({
  zone,
  /** Cap the columns. The band is a glance strip (3 across, like the flex row it replaces);
   *  the masonry breathes wider on a wall. */
  maxCols,
  /** Narrowest a column may get. A wall kiosk wants roomier cards (they're read from
   *  across the room), so it passes a bigger minimum and gets fewer, wider columns. */
  colMin,
  editing = false,
  dnd = null,
  expandedId = null,
  onExpand = NOOP_EXPAND,
  onCollapse = NOOP_COLLAPSE,
  className,
  'data-tour': dataTour,
  children,
}: {
  zone: CardZone
  maxCols: number
  colMin?: number
  editing?: boolean
  dnd?: PointerDnd | null
  expandedId?: BoardCardId | null
  onExpand?: (id: BoardCardId) => void
  onCollapse?: () => void
  className?: string
  // `data-tour` anchor id for the guided tour's spotlight (Cluster/Rail precedent).
  'data-tour'?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(1)
  const [narrow, setNarrow] = useState(false)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const read = (width: number) => {
      const cols = colsFor(width, maxCols, colMin)
      // Both setters bail when unchanged — no re-render storm from a resize burst.
      setCols((prev) => (prev === cols ? prev : cols))
      setNarrow((prev) => {
        const next = isNarrow(width, cols)
        return prev === next ? prev : next
      })
      setWidth((prev) => (prev === width ? prev : width))
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      // Coalesce a burst of observations into one write per frame.
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => read(w))
    })
    ro.observe(el)
    read(el.getBoundingClientRect().width)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [maxCols, colMin])

  const ctx = useMemo(
    () => ({ zone, cols, width, narrow, editing, dnd, expandedId, onExpand, onCollapse }),
    [zone, cols, width, narrow, editing, dnd, expandedId, onExpand, onCollapse],
  )

  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={ref}
        className={
          'wg' +
          (className ? ` ${className}` : '') +
          (editing ? ' wg--editing' : '') +
          (dnd?.over === zoneKey(zone, 'end') ? ' dnd-over' : '')
        }
        style={{ ['--wg-cols' as string]: cols }}
        data-zone={zone}
        data-tour={dataTour}
        // The grid's own trailing space is a drop target: releasing a card over the gap
        // below the last slot appends it to this zone. A pointer over a SLOT resolves to
        // the slot first (the hit-test walks up from the deepest element), so this only
        // catches drops that land between or after cards — including the empty-zone case,
        // which is how you drag the last card back INTO an emptied band.
        data-dnd-zone={editing ? zoneKey(zone, 'end') : undefined}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}
