import { describe, it, expect } from 'vitest'
import { BOARD_CARDS, DEFAULT_CARD_PREFS, cardMode, reconcile, visibleCards } from './boardCards'
import { CURATED_PHONE_CARDS, curateForTrial } from './curatedBoard'

describe('curateForTrial — the trial phone board', () => {
  it('shows only the curated cards (4–5) on an untouched layout', () => {
    const p = curateForTrial(DEFAULT_CARD_PREFS)
    const shown = [...visibleCards(p, 'band'), ...visibleCards(p, 'grid')]
    expect(shown.sort()).toEqual([...CURATED_PHONE_CARDS].sort())
    expect(shown.length).toBeGreaterThanOrEqual(4)
    expect(shown.length).toBeLessThanOrEqual(5)
  })

  it('only ever names cards that exist', () => {
    const ids = new Set(BOARD_CARDS.map((c) => c.id))
    for (const id of CURATED_PHONE_CARDS) expect(ids.has(id)).toBe(true)
  })

  it('leaves a layout the visitor arranged alone', () => {
    const own = reconcile({ hidden: ['photos'] })
    const p = curateForTrial(own)
    expect(p).toBe(own)
    expect(cardMode(p, 'upcoming')).toBe('auto')
  })

  it('never mutates the shared default', () => {
    curateForTrial(DEFAULT_CARD_PREFS)
    expect(DEFAULT_CARD_PREFS.mode).toEqual({})
  })
})
