import { describe, expect, it } from 'vitest'
import { STICKERS, STICKER_OFFER, stickersFor } from './stickers'

describe('sticker catalog', () => {
  // A duplicate glyph would break the offer draw (two identical cells) and the wall's
  // keys; the handler's whitelist is this same array, imported, so it can't drift.
  it('has no duplicate glyph', () => {
    expect(new Set(STICKERS).size).toBe(STICKERS.length)
  })
})

describe('stickersFor — the rotating daily offer', () => {
  const day = 1_752_465_600 // some local midnight
  const nextDay = day + 86_400

  it('always offers the same number of stickers', () => {
    for (const d of [day, nextDay, day + 5 * 86_400]) {
      expect(stickersFor(d, 'r1')).toHaveLength(STICKER_OFFER)
      expect(stickersFor(d, 'r2')).toHaveLength(STICKER_OFFER)
    }
  })

  it('is stable for the same day + routine (a redo shows the same choices)', () => {
    expect(stickersFor(day, 'r1')).toEqual(stickersFor(day, 'r1'))
  })

  it('differs day to day, and routine to routine within a day', () => {
    expect(stickersFor(day, 'r1')).not.toEqual(stickersFor(nextDay, 'r1'))
    expect(stickersFor(day, 'r1')).not.toEqual(stickersFor(day, 'r2'))
  })

  it('offers distinct glyphs, all from the catalog', () => {
    const offer = stickersFor(day, 'r1')
    expect(new Set(offer).size).toBe(offer.length)
    for (const s of offer) expect(STICKERS).toContain(s)
  })

  it('feels wide across a week: many distinct glyphs seen over 7 days', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 7; i++) for (const s of stickersFor(day + i * 86_400, 'r1')) seen.add(s)
    expect(seen.size).toBeGreaterThan(STICKER_OFFER * 2)
  })
})
