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
})
