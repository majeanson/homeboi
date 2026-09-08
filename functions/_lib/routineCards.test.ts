import { describe, expect, it } from 'vitest'
import { foldCardMedia, cardMediaKeys } from './routineCards'

// The fold that retired the routine deck's two positional side arrays (PARITY
// Wave D, 2026-09-08). Three things must hold, or a parent's voice plays on the
// wrong card again: a deck saved BEFORE the fold reads its media from the side
// columns by index; a card that carries its own key wins over the column; and a
// junk value never becomes a key.

const cards = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ icon: '⭐', label: `c${i}` })))

describe('foldCardMedia', () => {
  it('a pre-fold deck takes its clip and photo from the side columns, by index', () => {
    const out = foldCardMedia(cards(3), JSON.stringify(['rn_a', '', 'rn_c']), JSON.stringify(['', 'rcp_b', '']))
    expect(out.map((c) => c.clipKey ?? null)).toEqual(['rn_a', null, 'rn_c'])
    expect(out.map((c) => c.photoKey ?? null)).toEqual([null, 'rcp_b', null])
  })

  it("a card's own key wins over the side column — including an explicit '' (cleared)", () => {
    const deck = JSON.stringify([
      { icon: '⭐', label: 'own', clipKey: 'rn_own', photoKey: 'rcp_own' },
      { icon: '⭐', label: 'cleared', clipKey: '', photoKey: '' },
    ])
    const out = foldCardMedia(deck, JSON.stringify(['rn_col', 'rn_col2']), JSON.stringify(['rcp_col', 'rcp_col2']))
    expect(out[0].clipKey).toBe('rn_own')
    expect(out[0].photoKey).toBe('rcp_own')
    // The field was PRESENT and empty: the column must not resurrect it.
    expect(out[1].clipKey).toBeUndefined()
    expect(out[1].photoKey).toBeUndefined()
  })

  it('junk never becomes a key, and missing columns read as none', () => {
    const deck = JSON.stringify([{ icon: '⭐', label: 'x', clipKey: 42, photoKey: '../etc' }])
    const out = foldCardMedia(deck, null, undefined)
    expect(out[0].clipKey).toBeUndefined()
    expect(out[0].photoKey).toBeUndefined()
    expect(out[0].label).toBe('x')
  })

  it('a short or corrupt side column reads as all-none, never throws', () => {
    expect(() => foldCardMedia(cards(2), '{not json', '[')).not.toThrow()
    const out = foldCardMedia(cards(2), JSON.stringify(['rn_only']), '[]')
    expect(out.map((c) => c.clipKey ?? null)).toEqual(['rn_only', null])
  })
})

describe('cardMediaKeys', () => {
  it('collects every clip and photo, skipping cards without', () => {
    const out = cardMediaKeys([
      { icon: '⭐', label: 'a', clipKey: 'rn_1', photoKey: 'rcp_1' },
      { icon: '⭐', label: 'b' },
      { icon: '⭐', label: 'c', photoKey: 'rcp_3' },
    ])
    expect(out).toEqual(['rn_1', 'rcp_1', 'rcp_3'])
  })
})
