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

// The list is not only food. Every one of these is an ordinary grocery line, and the
// map had none of them — so in the toddler lens they all fell through to the caller's
// fallback, which on La liste is 🛒: the SAME cart the page wears in its own header.
// « Couches » showed a pre-reader the picture for "shopping" (2026-09-14, second frame
// of liste-toddler). A picture that cannot be told from the next one is not a picture.
describe('pictoFor — the household half of a grocery list', () => {
  it('draws diapers, paper and soap rather than falling through', () => {
    expect(pictoFor('Couches', '🛒')).toBe('👶')
    expect(pictoFor('couches taille 4', '🛒')).toBe('👶')
    expect(pictoFor('Lingettes', '🛒')).toBe('👶')
    expect(pictoFor('Papier hygiénique', '🛒')).toBe('🧻')
    expect(pictoFor('mouchoirs', '🛒')).toBe('🧻')
    expect(pictoFor('Savon à mains', '🛒')).toBe('🧼')
    expect(pictoFor('shampooing', '🛒')).toBe('🧼')
    expect(pictoFor('Dentifrice', '🛒')).toBe('🪥')
  })

  it('does not let « couche » swallow « coucher » — the bedtime routine keeps its own', () => {
    expect(pictoFor('Coucher')).toBe('😴')
    expect(pictoFor('L’heure du coucher')).toBe('😴')
  })
})

// « rendez-vous » is the vaguest word in the map, and it used to sit in the medical
// block ABOVE « dentiste » — so a tooth appointment drew a stethoscope. Same shape as
// the « maïs / maison » bug above: a generic key placed before what it swallows.
describe('pictoFor — specific beats generic', () => {
  it('a dentist appointment is a tooth, not a stethoscope', () => {
    expect(pictoFor('Rendez-vous dentiste')).toBe('🦷')
    expect(pictoFor('rendez-vous chez le coiffeur')).toBe('💇')
    expect(pictoFor('Rendez-vous docteur')).toBe('🩺')
  })
  it('…and a bare rendez-vous still gets the medical glyph', () => {
    expect(pictoFor('Rendez-vous')).toBe('🩺')
  })
})
