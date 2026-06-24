import { describe, it, expect } from 'vitest'
import { placeFil } from './dayRibbon'

// Times as unix seconds; pick a base midnight and add hours so the cases read clearly.
const DAY = Math.floor(Date.UTC(2026, 5, 24, 0, 0, 0) / 1000)
const at = (h: number) => DAY + h * 3600

describe('placeFil', () => {
  it('sorts items chronologically and flags past vs upcoming against now', () => {
    const now = at(12)
    const { rows } = placeFil([{ start_at: at(15) }, { start_at: at(9) }, { start_at: at(12) }], now)
    expect(rows.map((r) => r.item.start_at)).toEqual([at(9), at(12), at(15)])
    // 09:00 is past; 12:00 == now is NOT past (>= now is upcoming); 15:00 upcoming.
    expect(rows.map((r) => r.past)).toEqual([true, false, false])
  })

  it('places the « maintenant » marker before the first not-yet-started item', () => {
    const now = at(12)
    expect(placeFil([{ start_at: at(9) }, { start_at: at(15) }], now).nowIndex).toBe(1)
  })

  it('marker is after everything when the whole day is behind us', () => {
    expect(placeFil([{ start_at: at(8) }, { start_at: at(10) }], at(20)).nowIndex).toBe(2)
  })

  it('marker is before everything when the whole day is still ahead', () => {
    expect(placeFil([{ start_at: at(14) }, { start_at: at(18) }], at(6)).nowIndex).toBe(0)
  })

  it('the first row has no gap; later gaps scale with the time between items, clamped', () => {
    const { rows } = placeFil([{ start_at: at(8) }, { start_at: at(8.5) }, { start_at: at(20) }], at(0))
    expect(rows[0].gapBefore).toBe(0)
    // 30 min apart → below the floor → clamped to MIN_GAP (0.5).
    expect(rows[1].gapBefore).toBe(0.5)
    // 11.5 h apart → above the ceiling → clamped to MAX_GAP (2.5).
    expect(rows[2].gapBefore).toBe(2.5)
  })

  it('handles an empty list', () => {
    expect(placeFil([], at(12))).toEqual({ rows: [], nowIndex: 0 })
  })
})
