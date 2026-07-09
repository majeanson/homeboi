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
 * The narrowest a HALF card may get. Two of these + a gap must fit the grid on a 360px
 * phone — which is NOT 360px wide: the wall's padding and the scrollbar leave ~301px, so
 * a half is ~143px. Measured, not assumed; 150 here silently cost 360px phones their
 * second column.
 */
export const WG_PHONE_COL_MIN = 132

/** The width one column actually gets, once the gaps between them are paid for. */
export const colWidth = (width: number, cols: number): number =>
  cols <= 0 ? 0 : (width - (cols - 1) * WG_GAP) / cols

/**
 * Are this grid's columns narrower than a comfortable card?
 *
 * A phone's two columns are ~172px — fine for a card that opted into being a half, far
 * too tight for « Aujourd'hui »'s rows. So a card nobody has sized renders FULL width
 * here (see `CardSlot`); the columns exist only so a card *can* be halved.
 *
 * Derived from the MEASURED width, never from `surface === 'mobile'` — a wall tablet
 * signed in as the operator reports `mobile`, and would otherwise be treated as a phone.
 */
export const isNarrow = (width: number, cols: number): boolean =>
  Number.isFinite(width) && width > 0 && cols >= 2 && colWidth(width, cols) < WG_COL_MIN

/**
 * How many columns fit `width`, capped at `maxCols` and never below 1.
 *
 * Two rules, and the answer is the LARGER of them, which keeps the count monotonic in
 * width (a threshold-based rule put a cliff at the boundary: 599px got two columns and
 * 600px got one):
 *
 *  1. As many comfortable columns of `colMin` as fit. N of them need
 *     `N*colMin + (N-1)*GAP` — hence the `+ GAP` on both sides.
 *  2. **Always two, if two halves of `WG_PHONE_COL_MIN` physically fit.** Otherwise a
 *     phone has `cols === 1`, every size clamps to 1, and the size chip can do nothing:
 *     a card could only ever be full width. Two columns is what makes "small" mean
 *     *half*, exactly as a phone home screen fits two small widgets side by side.
 *
 * Counted in JS rather than left to `repeat(auto-fill, minmax(...))` because a card's size
 * has to be clamped against the count: a size-3 widget on a narrow grid must render
 * span-1 rather than overflow the viewport.
 */
export function colsFor(width: number, maxCols: number, colMin: number = WG_COL_MIN): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  const cap = Math.max(1, maxCols)
  const min = Number.isFinite(colMin) && colMin > 0 ? colMin : WG_COL_MIN
  const comfortable = Math.floor((width + WG_GAP) / (min + WG_GAP))
  const halves = width >= 2 * WG_PHONE_COL_MIN + WG_GAP ? 2 : 1
  return Math.max(1, Math.min(Math.max(comfortable, halves), cap))
}

/**
 * Below this RENDERED width (px) a card reads as compact: icon + title + at most one
 * quiet line, per the compact-lens design (see `CardLens` / `CardSlot`). Chosen so a
 * genuine half card is compact — a phone's ~301px grid gives a span-1 card ~142px,
 * well under — while a span-2 card on that same phone (~301px, i.e. the WHOLE grid)
 * reads as its normal full form.
 */
export const WG_COMPACT_MAX = 220

/**
 * Is a card spanning `span` columns, in a grid whose columns are `colW` wide, compact?
 *
 * Rendered width = `span*colW + (span-1)*GAP` — the card's own columns plus the gaps
 * BETWEEN them (not around them; the grid's outer gutter isn't the card's). Keys on
 * this MEASURED width, never on `surface === 'mobile'` — a wall tablet signed in as
 * the operator reports `mobile` and must not compact its cards, while a phone with a
 * card explicitly sized to 3-of-4 columns must not either, if that happens to render
 * wide.
 */
export function isCompact(colW: number, span: number): boolean {
  if (!Number.isFinite(colW) || colW <= 0 || !Number.isFinite(span) || span <= 0) return false
  const width = span * colW + (span - 1) * WG_GAP
  return width < WG_COMPACT_MAX
}
