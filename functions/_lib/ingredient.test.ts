import { describe, it, expect } from 'vitest'
import { ingredientName } from './ingredient'

describe('ingredientName', () => {
  it('strips a metric quantity + parenthetical + connector', () => {
    expect(ingredientName('15 ml (1 c. à soupe) de beurre non salé')).toBe('Beurre non salé')
  })
  it('strips a simple count', () => {
    expect(ingredientName('2 œufs')).toBe('Œufs')
  })
  it('strips grams + de', () => {
    expect(ingredientName('400 g de pâtes')).toBe('Pâtes')
  })
  it('handles a mixed fraction + unit', () => {
    expect(ingredientName('1 1/2 tasse de farine tout usage')).toBe('Farine tout usage')
  })
  it('leaves a quantity-less line alone (just capitalized)', () => {
    expect(ingredientName('sel et poivre')).toBe('Sel et poivre')
  })
  it('keeps an already-clean name', () => {
    expect(ingredientName('Beurre non salé')).toBe('Beurre non salé')
  })
  it('never strips the whole line away', () => {
    expect(ingredientName('500 g')).toBe('500 g')
  })
  it('handles a leading d-apostrophe', () => {
    expect(ingredientName("1 oignon")).toBe('Oignon')
    expect(ingredientName("250 ml d'huile d'olive")).toBe("Huile d'olive")
  })

  // The fix: an inline spoon phrase (no parenthetical) must not leak its suffix.
  it('eats the whole spoon phrase, not just "c."', () => {
    expect(ingredientName("1 c. à soupe d'huile d'olive")).toBe("Huile d'olive")
    expect(ingredientName('1 c. à thé de sel')).toBe('Sel')
    expect(ingredientName('2 cuillères à soupe de sucre')).toBe('Sucre')
    expect(ingredientName('1 c. à s. de moutarde')).toBe('Moutarde')
  })
  it('keeps a real ingredient that happens to be "soupe" or "thé"', () => {
    // "soupe"/"thé" are only eaten inside the spoon phrase — as a real item they stay.
    expect(ingredientName('1 boîte de soupe aux tomates')).toBe('Soupe aux tomates')
    expect(ingredientName('1 boîte de thé')).toBe('Thé')
  })
  it('still handles a bare "c." abbreviation with no "à"', () => {
    expect(ingredientName('1 c. de vanille')).toBe('Vanille')
  })

  // The glued unit. Found in the wild 2026-08-28: cook mode's « Il en manque »
  // flagged "60ml de farine blanche" — the WHOLE line, measurement included —
  // because "60ml" is one token to split(' '), so the leading walk stopped on its
  // first token and stripped nothing at all. You buy flour, not 60 ml of it.
  it('splits a glued quantity+unit ("60ml")', () => {
    expect(ingredientName('60ml de farine blanche')).toBe('Farine blanche')
    expect(ingredientName('250g de beurre')).toBe('Beurre')
    expect(ingredientName('1L de lait')).toBe('Lait')
  })
  it('never splits a digit-led word that is not a unit', () => {
    // "up" is not a unit, so "7up" stays whole rather than becoming "Up".
    expect(ingredientName('7up')).toBe('7up')
  })

  // The mirror-image miss: the measurement TRAILS the item.
  it('strips a trailing measurement run', () => {
    expect(ingredientName('Farine blanche 60 ml')).toBe('Farine blanche')
    expect(ingredientName('Beurre 250 g')).toBe('Beurre')
  })
  it('keeps a trailing unit word that carries no quantity', () => {
    // Without the sawQty guard this would lose its last word ("Sauce en").
    expect(ingredientName('Sauce en pot')).toBe('Sauce en pot')
    expect(ingredientName('Crème 35%')).toBe('Crème 35%')
  })
})
