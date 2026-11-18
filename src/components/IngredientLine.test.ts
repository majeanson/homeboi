import { describe, it, expect } from 'vitest'
import { ingredientOf } from './IngredientLine'
import { findMeasures } from '../lib/measure'
import { recipeLangAttr } from '../lib/recipes'

// Review #35: three pills read « Écouter : 1/2 tasse » — the pill's name now carries WHAT.
describe('ingredientOf', () => {
  const of = (line: string) => ingredientOf(line, findMeasures(line))
  it('is the line minus its amounts, minus a leading « de »', () => {
    expect(of('1/2 tasse de farine')).toBe('farine')
    expect(of('2 c. à soupe d’huile d’olive')).toBe('huile d’olive')
    expect(of('1 cup of sugar')).toBe('sugar')
    expect(of('3 oeufs')).toBe('3 oeufs')
  })
})

// Review #35: an English recipe in a French app says so, and only then.
describe('recipeLangAttr', () => {
  it('marks a recipe only when its language differs from the page', () => {
    expect(recipeLangAttr('en', 'fr')).toBe('en')
    expect(recipeLangAttr('fr', 'en')).toBe('fr')
    expect(recipeLangAttr('fr', 'fr')).toBeUndefined()
    expect(recipeLangAttr(null, 'fr')).toBeUndefined()
  })
})
