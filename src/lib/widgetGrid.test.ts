import { describe, it, expect } from 'vitest'
import { colsFor, rowSpan, WG_COL_MIN, WG_GAP, WG_ROW } from './widgetGrid'

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

describe('colsFor', () => {
  it('gives one column to a phone', () => {
    expect(colsFor(360, 4)).toBe(1)
    expect(colsFor(300, 4)).toBe(1)
  })

  it('adds a column only once another full one FITS, gap included', () => {
    // Two columns need 2*300 + 16 = 616px. One pixel short must stay at one.
    expect(colsFor(2 * WG_COL_MIN + WG_GAP - 1, 4)).toBe(1)
    expect(colsFor(2 * WG_COL_MIN + WG_GAP, 4)).toBe(2)
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
