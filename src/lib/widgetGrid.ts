// The board widget-space geometry — pure arithmetic, no React, no DOM, so it can be
// exhaustively tested. `components/board/WidgetGrid.tsx` is the thin React shell that
// feeds these a measured width/height.
//
// THESE CONSTANTS ARE LOAD-BEARING: they must match `--wg-row` / `--wg-gap` in
// styles/board/widget-grid.css. Change one, change both, or every card's height is
// quietly wrong (the card would claim too few rows and clip, or too many and leave a gap).

/** The fine row ruler a card's height is quantised to. */
export const WG_ROW = 8
/** The gutter between cards, on both axes. */
export const WG_GAP = 16
/** The narrowest a single column may get before we drop one. Matches the old `columns: 300px`. */
export const WG_COL_MIN = 300

/**
 * The smallest row span whose usable height covers `height`.
 *
 * A grid item spanning N rows also covers the N-1 row-gaps *between* those rows, so its
 * usable height is `N*ROW + (N-1)*GAP`, not `N*ROW`. Requiring that to be ≥ h and solving
 * for N gives `N = ceil((h + GAP) / (ROW + GAP))`. Forgetting the gap term is the classic
 * masonry bug: cards clip their last line at large spans.
 *
 * The gap left over *after* the item is what draws the gutter — which is why a card inside
 * a slot must carry no bottom margin of its own.
 */
export function rowSpan(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 1
  return Math.max(1, Math.ceil((height + WG_GAP) / (WG_ROW + WG_GAP)))
}

/**
 * How many columns of at least `WG_COL_MIN` fit in `width`, capped at `maxCols` and never
 * below 1. N columns need `N*COL_MIN + (N-1)*GAP` — hence the `+ GAP` on both sides.
 *
 * Counted in JS rather than left to `repeat(auto-fill, minmax(...))` because a card's size
 * has to be clamped against the count: a size-3 widget on a one-column phone must render
 * span-1 rather than overflow the viewport.
 */
export function colsFor(width: number, maxCols: number, colMin: number = WG_COL_MIN): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  const min = Number.isFinite(colMin) && colMin > 0 ? colMin : WG_COL_MIN
  const fit = Math.floor((width + WG_GAP) / (min + WG_GAP))
  return Math.max(1, Math.min(fit, Math.max(1, maxCols)))
}
