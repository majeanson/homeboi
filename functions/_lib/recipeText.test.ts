import { describe, expect, it } from 'vitest'
import { cleanRecipeMath, cleanRecipeTitle } from './recipeText'

// Review #13: « # Tarte au gruau » and `\(180^{\circ}C\)` reached the book, cook mode,
// TTS and the screen reader as written.

describe('cleanRecipeTitle', () => {
  it('drops a leading Markdown heading mark', () => {
    expect(cleanRecipeTitle('# Tarte au gruau')).toBe('Tarte au gruau')
    expect(cleanRecipeTitle('  ### Soupe ')).toBe('Soupe')
  })
  it('keeps a title that merely contains a hash', () => {
    expect(cleanRecipeTitle('Pâtes #2')).toBe('Pâtes #2')
    expect(cleanRecipeTitle('#1 des tartes')).toBe('#1 des tartes')
  })
})

describe('cleanRecipeMath', () => {
  it('turns the oven temperature into words a cook would type', () => {
    expect(cleanRecipeMath('Préchauffer le four à \\(180^{\\circ}C\\).')).toBe('Préchauffer le four à 180°C.')
    expect(cleanRecipeMath('Cuire à 350^\\circ F')).toBe('Cuire à 350° F')
  })
  it('handles fractions, text and times', () => {
    expect(cleanRecipeMath('Ajouter \\(\\frac{1}{2}\\) tasse')).toBe('Ajouter 1/2 tasse')
    expect(cleanRecipeMath('\\[2 \\times 250\\,\\text{g}\\]')).toBe('2 × 250 g')
  })
  it('leaves ordinary text, a section heading and a price alone', () => {
    expect(cleanRecipeMath('## Pâte')).toBe('## Pâte')
    expect(cleanRecipeMath('Environ 5 $ de fromage')).toBe('Environ 5 $ de fromage')
    expect(cleanRecipeMath('Mélanger')).toBe('Mélanger')
  })
})
