import { describe, it, expect } from 'vitest'
import { ingredientsForStep, stepSentences } from './recipeSteps'

const INGS = ['400 g de pâtes', '1 pot de sauce tomate', '500 g de bœuf haché', '1 oignon']

describe('ingredientsForStep', () => {
  it('matches an ingredient by its name appearing in the step', () => {
    expect(ingredientsForStep('Faire bouillir les pâtes 10 minutes.', INGS)).toEqual(['400 g de pâtes'])
  })

  it('matches several ingredients in one step', () => {
    expect(ingredientsForStep('Faire revenir le bœuf et l’oignon.', INGS)).toEqual([
      '500 g de bœuf haché',
      '1 oignon',
    ])
  })

  it('expands œ/æ ligatures so "bœuf" matches "bœuf"', () => {
    expect(ingredientsForStep('Dorer le bœuf.', INGS)).toEqual(['500 g de bœuf haché'])
  })

  it('matches accent- and case-insensitively', () => {
    expect(ingredientsForStep('AJOUTER LA SAUCE.', INGS)).toEqual(['1 pot de sauce tomate'])
  })

  it('returns nothing when no ingredient is named', () => {
    expect(ingredientsForStep('Saler au goût.', INGS)).toEqual([])
  })

  // Whole-word match: a token must not light up inside a longer, unrelated word —
  // "ail" (garlic) must NOT match "tailler", "lait" must NOT match "laitue".
  it('does not match an ingredient name inside a longer word', () => {
    expect(ingredientsForStep('Tailler finement les légumes.', ['1 gousse d’ail'])).toEqual([])
    expect(ingredientsForStep('Laver la laitue.', ['250 ml de lait'])).toEqual([])
    expect(ingredientsForStep('Faire la vaisselle.', ['1 pincée de sel'])).toEqual([])
  })

  // …but a real plural/singular difference still matches (oignon ↔ oignons).
  it('matches across a regular plural', () => {
    expect(ingredientsForStep('Émincer les oignons.', ['1 oignon'])).toEqual(['1 oignon'])
    expect(ingredientsForStep('Couper la tomate.', ['2 tomates'])).toEqual(['2 tomates'])
  })

  it('keeps the quantities of the lines passed in (scaled or not)', () => {
    expect(ingredientsForStep('Cuire les pâtes.', ['800 g de pâtes'])).toEqual(['800 g de pâtes'])
  })

  it('ignores "## Section" markers in the ingredient list', () => {
    expect(ingredientsForStep('Préparer le glaçage.', ['## Glaçage', '120 g de sucre'])).toEqual([])
  })

  // The cookie sugar and the glaze sugar both say "sucre"; section scoping keeps
  // the glaze step from showing the cookie's sugar.
  const SECTIONED = ['## Biscuits', '250 g de farine', '100 g de sucre', '## Glaçage', '120 g de sucre en poudre', '30 ml de lait']

  it('scopes to the step’s own section when the ingredient list has one', () => {
    expect(ingredientsForStep('Fouetter le sucre et le lait.', SECTIONED, 'Glaçage')).toEqual([
      '120 g de sucre en poudre',
      '30 ml de lait',
    ])
  })

  it('matches a section by loose containment ("Pour le glaçage" ↔ "Glaçage")', () => {
    expect(ingredientsForStep('Étaler le sucre.', SECTIONED, 'Pour le glaçage')).toEqual(['120 g de sucre en poudre'])
  })

  it('falls back to the whole list when the step section has no ingredient match', () => {
    // No "Cuisson" ingredient group → search everything (still skips markers).
    expect(ingredientsForStep('Incorporer la farine.', SECTIONED, 'Cuisson')).toEqual(['250 g de farine'])
  })
})

describe('stepSentences', () => {
  it('splits a multi-sentence step into bullets', () => {
    expect(stepSentences('Cuire le poulet. Garnir les tortillas.')).toEqual([
      'Cuire le poulet.',
      'Garnir les tortillas.',
    ])
  })

  it('keeps a single sentence whole', () => {
    expect(stepSentences('Faire bouillir les pâtes 10 minutes.')).toEqual(['Faire bouillir les pâtes 10 minutes.'])
  })

  it('does not split on a decimal point', () => {
    expect(stepSentences('Cuire 1.5 h au four.')).toEqual(['Cuire 1.5 h au four.'])
  })
})
