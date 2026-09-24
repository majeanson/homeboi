import { describe, it, expect } from 'vitest'
import { ingredientsAreMethod, ingredientsFromMethod, repairRecipeRead, salvageFieldLines } from './recipeRepair'

// Marc's card, 2026-09-24 — « Brocoli sauté au miel et au sésame », a paragraph recipe
// with no ingredient list. The vision read came back with the METHOD as ingredients and
// six leaked field lines. These are its real steps, as the read produced them.
const STEPS = [
  'Défaire 1 brocoli en fleurons. Peler le pied du brocoli et couper en bâtonnets.',
  'Dans un grand poêlon antiadhésif, chauffer 15 ml (1 c. à soupe) d’huile d’olive à feu moyen-vif.',
  'Ajouter 2 gousses d’ail hachées finement, 15 ml (1 c. soupe) de graines de sésame et une pincée de flocons de piment fort.',
  'Cuire 2 minutes.',
  'Ajouter les fleurons et les bâtonnets de brocoli et cuire 5 minutes ou jusqu’à ce que le brocoli soit cuit, mais encore croquant.',
  'Verser 15 ml (1 c. à soupe) de miel et 7,5 ml (1/2 c. à soupe) de sauce soya réduite en sodium. Poursuivre la cuisson 30 secondes en mélangeant pour enrober le brocoli.',
  'Servir.',
]
const READ = {
  ingredients: [...STEPS.slice(0, 6), 'Servings', '4', 'PrepMin', '5', 'CookMin', '10'],
  steps: STEPS,
  servings: null,
  times: { prep: null, cook: null, total: null },
}

describe('salvageFieldLines', () => {
  it('drops leaked field names and bare numbers, keeping the values', () => {
    const s = salvageFieldLines(['2 oeufs', 'Servings', '4', 'PrepMin', '5', 'CookMin', '10', '42'])
    expect(s).toEqual({ lines: ['2 oeufs'], servings: 4, prep: 5, cook: 10 })
  })
  it('leaves a real line that merely contains a number alone', () => {
    expect(salvageFieldLines(['4 tasses de farine']).lines).toEqual(['4 tasses de farine'])
  })
})

describe('ingredientsAreMethod', () => {
  it('sees the method copied into the ingredients', () => {
    expect(ingredientsAreMethod(STEPS.slice(0, 6), STEPS)).toBe(true)
  })
  it('a real ingredient list is not the method', () => {
    expect(ingredientsAreMethod(['250 ml de farine', '2 oeufs'], STEPS)).toBe(false)
  })
})

describe('ingredientsFromMethod — word for word, never invented', () => {
  it('lifts every measured phrase out of Marc’s card, and nothing else', () => {
    expect(ingredientsFromMethod(STEPS)).toEqual([
      '1 brocoli',
      '15 ml (1 c. à soupe) d’huile d’olive',
      '2 gousses d’ail hachées finement',
      '15 ml (1 c. soupe) de graines de sésame',
      'une pincée de flocons de piment fort',
      '15 ml (1 c. à soupe) de miel',
      '7,5 ml (1/2 c. à soupe) de sauce soya réduite en sodium',
    ])
  })
  it('a duration, a yield or a keeping time is not an ingredient', () => {
    expect(ingredientsFromMethod(['Cuire 2 minutes.', 'Donne 4 portions.', 'Se conserve 3 mois au congélateur.', 'Cuire 30 secondes.'])).toEqual([])
  })
  it('works in English too', () => {
    expect(ingredientsFromMethod(['Heat 2 tbsp olive oil in a pan, add 3 cloves garlic and cook 2 minutes.'])).toEqual([
      '2 tbsp olive oil',
      '3 cloves garlic',
    ])
  })
})

describe('repairRecipeRead', () => {
  it('turns the broken read of Marc’s card into a usable draft', () => {
    const r = repairRecipeRead(READ)
    expect(r.ingredients).toHaveLength(7)
    expect(r.ingredients[0]).toBe('1 brocoli')
    expect(r.steps).toEqual(STEPS)
    expect(r.servings).toBe(4)
    expect(r.times).toEqual({ prep: 5, cook: 10, total: null })
  })
  it('an honest read is left exactly as it was', () => {
    const ok = { ingredients: ['250 ml de farine', '2 oeufs'], steps: ['Mélanger.'], servings: 2, times: { prep: null, cook: null, total: null } }
    expect(repairRecipeRead(ok)).toEqual(ok)
  })
})
