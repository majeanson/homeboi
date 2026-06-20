import { describe, it, expect } from 'vitest'
import { detectLang } from './langDetect'

const FR_RECIPE = [
  'Gâteau au chocolat',
  '2 tasses de farine',
  '1 cuillère à thé de sel',
  '125 g de beurre',
  'Mélanger la farine et le sucre, puis ajouter les œufs.',
  'Cuire au four pendant 30 minutes à feu doux.',
].join('\n')

const EN_RECIPE = [
  'Chocolate cake',
  '2 cups of flour',
  '1 teaspoon of salt',
  '125 g butter',
  'Mix the flour and sugar, then add the eggs.',
  'Bake in the oven for 30 minutes until set.',
].join('\n')

describe('detectLang', () => {
  it('detects a French recipe', () => {
    expect(detectLang(FR_RECIPE)).toBe('fr')
  })

  it('detects an English recipe', () => {
    expect(detectLang(EN_RECIPE)).toBe('en')
  })

  it('detects French even without accents typed', () => {
    expect(detectLang('Melanger la farine et le sucre, ajouter le lait puis cuire au four.')).toBe('fr')
  })

  it('leaves it undetermined (null) when there is too little text', () => {
    expect(detectLang('')).toBeNull()
    expect(detectLang('Sel')).toBeNull()
    expect(detectLang('1 cup')).toBeNull()
  })

  it('is not flipped by a stray loanword accent in English text', () => {
    expect(
      detectLang('Sauté the onions in butter, then add the purée and stir for ten minutes in the pan.'),
    ).toBe('en')
  })
})
