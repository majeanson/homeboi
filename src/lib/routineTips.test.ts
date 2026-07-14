import { describe, expect, it } from 'vitest'
import { tipFor, suggestedTip } from './routineTips'

// « Le truc du compagnon ». The cascade is the whole feature: the parent's own words
// beat the catalog, the catalog is keyed on the picture the parent picked, and a step
// with nothing worth saying returns null so the caller says a warm line instead of
// filler dressed up as advice.
describe('tipFor', () => {
  it('gives the parent’s own trick, verbatim, over everything else', () => {
    const card = { icon: '🪥', label: 'brosse les dents', tip: 'regarde derrière la porte' }
    expect(tipFor(card, 'fr')).toBe('regarde derrière la porte')
    // Even in the other language: the parent typed it, we don't translate a human.
    expect(tipFor(card, 'en')).toBe('regarde derrière la porte')
  })

  it('ignores a blank/whitespace tip and falls through to the catalog', () => {
    expect(tipFor({ icon: '🪥', label: 'dents', tip: '   ' }, 'fr')).toContain('langue')
  })

  it('keys on the card’s emoji — the picture the parent picked by hand', () => {
    expect(tipFor({ icon: '🧥', label: 'anything' }, 'fr')).toContain('capuchon')
    expect(tipFor({ icon: '🧥', label: 'anything' }, 'en')).toContain('hood')
  })

  it('falls back to the LABEL through pictoFor when the glyph is off-catalog', () => {
    // '⭐' is the deck editor's default glyph and carries no trick — but the word does.
    expect(tipFor({ icon: '⭐', label: 'brosse tes dents' }, 'fr')).toContain('langue')
    expect(tipFor({ icon: '⭐', label: 'le bain' }, 'fr')).toContain('coude')
  })

  it('returns null when neither the glyph nor the word has a trick', () => {
    expect(tipFor({ icon: '⭐', label: 'zzzz' }, 'fr')).toBeNull()
    expect(tipFor({}, 'fr')).toBeNull()
  })

  it('suggestedTip answers "what would the catalog say", ignoring the parent’s override', () => {
    // The deck editor shows this as the field's PLACEHOLDER — so it must show the
    // built-in even on a card that already has the parent's own trick typed in.
    const card = { icon: '🛁', label: 'bain', tip: 'mon truc à moi' }
    expect(suggestedTip(card, 'fr')).toContain('coude')
  })

  it('never grades: no trick mentions speed, a score, or doing better than before', () => {
    const forbidden = /bravo|champion|record|plus vite|faster|score|points?\b|streak|gagné|winner/i
    const cards = ['🪥', '🧥', '👟', '🌙', '🧺', '🎒', '🚗', '🧸', '🚽', '📖'].flatMap((icon) => [
      tipFor({ icon }, 'fr'),
      tipFor({ icon }, 'en'),
    ])
    expect(cards.every((c) => !!c)).toBe(true)
    for (const c of cards) expect(c).not.toMatch(forbidden)
  })
})
