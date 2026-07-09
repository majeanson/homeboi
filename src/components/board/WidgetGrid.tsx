import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { type CardZone } from '../../lib/boardCards'
import { colsFor } from '../../lib/widgetGrid'

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
  /** Edit mode is armed on this grid (long-press, or ?edit=1). */
  editing: boolean
}

const Ctx = createContext<WidgetGridCtx | null>(null)

/** Read the grid a card sits in. Null outside a WidgetGrid (a card rendered standalone). */
export const useWidgetGrid = (): WidgetGridCtx | null => useContext(Ctx)

export function WidgetGrid({
  zone,
  /** Cap the columns. The band is a glance strip (3 across, like the flex row it replaces);
   *  the masonry breathes wider on a wall. */
  maxCols,
  editing = false,
  className,
  children,
}: {
  zone: CardZone
  maxCols: number
  editing?: boolean
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const read = (width: number) =>
      setCols((prev) => {
        const next = colsFor(width, maxCols)
        return prev === next ? prev : next // bail when unchanged — no re-render storm
      })
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
  }, [maxCols])

  return (
    <Ctx.Provider value={{ zone, cols, editing }}>
      <div
        ref={ref}
        className={'wg' + (className ? ` ${className}` : '') + (editing ? ' wg--editing' : '')}
        style={{ ['--wg-cols' as string]: cols }}
        data-zone={zone}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}
