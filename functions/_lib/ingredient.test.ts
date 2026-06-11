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
})
