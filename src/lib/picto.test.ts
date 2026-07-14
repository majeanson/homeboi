import { describe, it, expect } from 'vitest'
import { pictoFor } from './picto'

// The picto is the ONLY thing a pre-reader can read (toddler lens: the meal hero is
// a picture). A wrong glyph doesn't degrade — it lies.
describe('pictoFor', () => {
  it('matches whole words, not fragments — « maison » is not « maïs »', () => {
    // The bug this test exists for: « Spaghetti maison » → 🌽, because "ma-IS-on"
    // contains the corn key « mais », listed before pasta.
    expect(pictoFor('Spaghetti maison')).toBe('🍝')
    expect(pictoFor('Sauce maison')).not.toBe('🌽')
    // …while real corn still finds corn, accented or not.
    expect(pictoFor('maïs')).toBe('🌽')
    expect(pictoFor('Épluchette de blé d’Inde et maïs')).toBe('🌽')
  })

  it('allows a plural s and ordinary punctuation around the word', () => {
    // (MAP order is first-match-wins by design — « Pâtes au beurre » is butter's,
    // not pasta's. These labels carry no competing key.)
    expect(pictoFor('Pâtes')).toBe('🍝')
    expect(pictoFor('nouilles, sauce soja')).toBe('🍝')
    expect(pictoFor('Lasagne')).toBe('🍝')
  })

  it('falls back rather than guessing when nothing matches', () => {
    expect(pictoFor('Zzzxyq')).toBe('•')
    expect(pictoFor('Zzzxyq', '🍽️')).toBe('🍽️')
  })
})
