import { describe, it, expect } from 'vitest'
import {
  colsFor,
  colWidth,
  isCompact,
  isNarrow,
  rowIndexAt,
  rowSpan,
  WG_COL_MIN,
  WG_COMPACT_MAX,
  WG_GAP,
  WG_MINI_H,
  WG_MINI_MAX_ITEMS,
  WG_MINI_ROWS,
  WG_PHONE_COL_MIN,
  WG_ROW,
} from './widgetGrid'

/** The height a slot actually gets when it claims `n` rows: it swallows the n-1 gaps. */
const usableHeight = (n: number) => n * WG_ROW + (n - 1) * WG_GAP

describe('rowSpan', () => {
  it('always fits the content — never clips it', () => {
    // The whole point. If the gap term were dropped from the formula, large cards would
    // claim too few rows and clip their last line; this catches exactly that.
    for (const h of [1, 7, 8, 9, 24, 25, 100, 173, 306, 620, 1024]) {
      expect(usableHeight(rowSpan(h))).toBeGreaterThanOrEqual(h)
    }
  })

  it('is the SMALLEST span that fits — never wastes a row', () => {
    for (const h of [9, 24, 25, 100, 173, 306, 620]) {
      const n = rowSpan(h)
      if (n > 1) expect(usableHeight(n - 1)).toBeLessThan(h)
    }
  })

  it('a card exactly filling n rows claims exactly n', () => {
    for (const n of [1, 2, 5, 13, 40]) expect(rowSpan(usableHeight(n))).toBe(n)
  })

  it('one more pixel than a span fits needs one more row', () => {
    for (const n of [1, 3, 12]) expect(rowSpan(usableHeight(n) + 1)).toBe(n + 1)
  })

  it('never returns less than one row, whatever nonsense it is handed', () => {
    expect(rowSpan(0)).toBe(1)
    expect(rowSpan(-40)).toBe(1)
    expect(rowSpan(Number.NaN)).toBe(1)
    expect(rowSpan(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('colsFor — the phone rule', () => {
  it('gives a phone TWO columns, so "small" can mean half', () => {
    // One column would clamp every size to 1: the size chip could never split a card.
    expect(colsFor(360, 4)).toBe(2)
    expect(colsFor(390, 4)).toBe(2)
    expect(colsFor(430, 4)).toBe(2)
  })

  it('falls back to one column when two halves genuinely cannot fit', () => {
    expect(colsFor(2 * WG_PHONE_COL_MIN + WG_GAP - 1, 4)).toBe(1)
    expect(colsFor(2 * WG_PHONE_COL_MIN + WG_GAP, 4)).toBe(2)
  })

  it('still honours the zone cap on a phone', () => {
    expect(colsFor(390, 1)).toBe(1)
  })

  it('the column count only ever grows with width — no cliff at any threshold', () => {
    // A threshold-based phone rule put one here: 599px got two columns, 600px got one.
    let prev = 0
    for (let w = 200; w <= 1600; w += 1) {
      const cols = colsFor(w, 4)
      expect(cols, `cols shrank at ${w}px`).toBeGreaterThanOrEqual(prev)
      prev = cols
    }
  })

  it('flags a phone as narrow, and a tablet as not', () => {
    // Narrow = the columns are tighter than a comfortable card, so an un-sized card
    // renders full width there. Derived from measured width, never from `surface`.
    expect(isNarrow(360, colsFor(360, 4))).toBe(true) // two ~172px columns
    expect(isNarrow(834, colsFor(834, 4))).toBe(false) // two ~409px columns
    expect(isNarrow(1280, colsFor(1280, 4))).toBe(false)
    expect(isNarrow(360, 1)).toBe(false) // one column is never "narrow"
  })

  it('colWidth pays for the gaps between the columns', () => {
    expect(colWidth(360, 2)).toBe((360 - WG_GAP) / 2)
    expect(colWidth(1000, 1)).toBe(1000)
    expect(colWidth(100, 0)).toBe(0)
  })
})

describe('colsFor — wider grids', () => {
  it('adds a column only once another COMFORTABLE one fits, gap included', () => {
    // Beyond the guaranteed two, a column must be worth WG_COL_MIN. Three of them need
    // 3*300 + 2*16 = 932px; one pixel short stays at two.
    const three = 3 * WG_COL_MIN + 2 * WG_GAP
    expect(colsFor(three - 1, 4)).toBe(2)
    expect(colsFor(three, 4)).toBe(3)
  })

  it('never exceeds the zone cap — the band is a glance strip', () => {
    expect(colsFor(4000, 3)).toBe(3)
    expect(colsFor(4000, 4)).toBe(4)
  })

  it('never returns less than one column', () => {
    expect(colsFor(0, 4)).toBe(1)
    expect(colsFor(-100, 4)).toBe(1)
    expect(colsFor(Number.NaN, 4)).toBe(1)
    expect(colsFor(1200, 0)).toBe(1)
  })

  it('a typical wall tablet gets a real masonry', () => {
    expect(colsFor(1280, 4)).toBeGreaterThanOrEqual(3)
  })
})

describe('isCompact', () => {
  it('a span-1 card on a real phone grid (301px, 2 cols) IS compact', () => {
    const cols = colsFor(301, 4)
    expect(cols).toBe(2)
    const colW = colWidth(301, cols)
    expect(isCompact(colW, 1)).toBe(true)
  })

  it('a span-2 card on that same phone grid — the WHOLE grid — is NOT compact', () => {
    const cols = colsFor(301, 4)
    const colW = colWidth(301, cols)
    expect(isCompact(colW, 2)).toBe(false)
  })

  it('a span-1 card on a 4-column kiosk (~288px columns) is NOT compact', () => {
    const cols = colsFor(1280, 4)
    const colW = colWidth(1280, cols)
    expect(colW).toBeGreaterThan(220)
    expect(isCompact(colW, 1)).toBe(false)
  })

  it('is exact at the WG_COMPACT_MAX boundary', () => {
    // width = span*colW + (span-1)*GAP; for span 1, width === colW.
    expect(isCompact(WG_COMPACT_MAX - 1, 1)).toBe(true)
    expect(isCompact(WG_COMPACT_MAX, 1)).toBe(false)
  })

  it('a wider span needs a proportionally narrower column to stay compact', () => {
    // span 2: 2*colW + GAP < MAX  =>  colW < (MAX-GAP)/2
    const boundary = (WG_COMPACT_MAX - WG_GAP) / 2
    expect(isCompact(boundary - 1, 2)).toBe(true)
    expect(isCompact(boundary, 2)).toBe(false)
  })

  it('never returns true for nonsense input', () => {
    expect(isCompact(0, 1)).toBe(false)
    expect(isCompact(-50, 1)).toBe(false)
    expect(isCompact(Number.NaN, 1)).toBe(false)
    expect(isCompact(150, 0)).toBe(false)
    expect(isCompact(150, -1)).toBe(false)
  })
})

describe('the compact tile shelf', () => {
  // The stagger bug, as an assertion. `CardSlot` claims WG_MINI_ROWS for a mini WITHOUT
  // measuring it, and widget-grid.css sizes the tile to `--wg-mini-h`. If those two ever
  // disagree, every mini leaves dead space in its slot (or overflows it) — and the board
  // goes back to reading as a ragged skyline.
  it('WG_MINI_H is exactly what WG_MINI_ROWS rows are worth', () => {
    expect(rowSpan(WG_MINI_H)).toBe(WG_MINI_ROWS)
    // Exact, not merely "fits": one pixel more would already need another row.
    expect(rowSpan(WG_MINI_H + 1)).toBe(WG_MINI_ROWS + 1)
  })

  it('--wg-mini-h in widget-grid.css is this number', () => {
    // The CSS can't import the constant, so the constant asserts its own value. Change one,
    // change both — this test is the tripwire.
    expect(WG_MINI_H).toBe(152)
  })

  it('never promises more rows than the shelf can hold', () => {
    // The list face spends WG_MINI_H on a header + WG_MINI_MAX_ITEMS one-line rows +
    // padding. These three numbers mirror widget-grid.css (`.cardmini--list`); if the cap
    // ever outgrew the shelf the last row would clip, which is the one failure a fixed
    // height can produce and a `min-height` never could.
    const HEADER = 24 // the tinted disc + the card's title
    const ROW = 17 // 0.78rem at line-height 1.35, plus the 3px gap
    const PADDING = 20 // 0.62rem, top and bottom
    expect(HEADER + PADDING + WG_MINI_MAX_ITEMS * ROW).toBeLessThanOrEqual(WG_MINI_H)
  })

  it('stays a glance, not a list view', () => {
    // Calm: the cap is a ceiling on how much a 142px tile may say, not just what fits.
    expect(WG_MINI_MAX_ITEMS).toBeLessThanOrEqual(5)
  })
})

describe('rowIndexAt — the pin that keeps an opened card under your eye', () => {
  it('is the exact inverse of where the ruler puts a row', () => {
    // Row N starts at (N-1)*(ROW+GAP): every row carries its gap AFTER it. If these two
    // ever disagree, an expanded card is pinned to the wrong row and lands on top of (or
    // a shelf away from) where the eye left it.
    for (let n = 1; n <= 40; n++) {
      expect(rowIndexAt((n - 1) * (WG_ROW + WG_GAP))).toBe(n)
    }
  })

  it('rounds, so a sub-pixel measurement never reads as the row above', () => {
    const step = WG_ROW + WG_GAP
    expect(rowIndexAt(2 * step - 0.4)).toBe(3)
    expect(rowIndexAt(2 * step + 0.4)).toBe(3)
  })

  it('never returns a row a grid does not have', () => {
    // `grid-row-start` is 1-based and 0 / negative is not a placement — a slot measured
    // at (or above) the grid's own top belongs to row 1.
    for (const bad of [0, -1, -1000, NaN, Infinity, -Infinity]) {
      expect(rowIndexAt(bad)).toBe(1)
    }
  })
})
