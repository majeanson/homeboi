import { describe, it, expect } from 'vitest'
import { normKey, rankCookable } from './cookable'

const R = {
  spag: { title: 'Spaghetti', ingredients: ['400 g de pâtes', '1 pot de sauce tomate', '500 g de bœuf', '1 oignon'] },
  taco: { title: 'Tacos', ingredients: ['Tortillas', 'Poulet', 'Salsa', 'Laitue'] },
  soup: { title: 'Soupe', ingredients: ['Beurre', 'Oignon', 'Bouillon'] },
}

describe('normKey', () => {
  it('strips quantity + unit and folds accents', () => {
    expect(normKey('400 g de pâtes')).toBe('pates')
    expect(normKey('Beurre')).toBe('beurre')
    expect(normKey('2 oignons')).toBe('oignons') // a non-unit word is not eaten
    expect(normKey('1 pot de sauce tomate')).toBe('sauce tomate')
    expect(normKey('Œufs')).toBe('oeufs')
  })
})

describe('rankCookable', () => {
  it('treats a recipe with nothing out-of-stock as ready (0 missing)', () => {
    const ranked = rankCookable([R.spag], ['Beurre', 'Café'], [])
    expect(ranked[0].missing).toEqual([])
  })

  it('flags an out-of-stock ingredient as missing', () => {
    const ranked = rankCookable([R.spag], ['Oignon'], [])
    expect(ranked[0].missing).toEqual(['Oignon'])
  })

  it('does not flag something already on the list', () => {
    const ranked = rankCookable([R.spag], ['Oignon'], ['Oignon'])
    expect(ranked[0].missing).toEqual([])
  })

  it('orders fewest-missing first, then by title', () => {
    // Out of butter + onion: Spaghetti needs onion (1), Soupe needs both (2),
    // Tacos needs neither (0).
    const ranked = rankCookable([R.spag, R.soup, R.taco], ['Beurre', 'Oignon'], [])
    expect(ranked.map((r) => r.recipe.title)).toEqual(['Tacos', 'Spaghetti', 'Soupe'])
    expect(ranked.find((r) => r.recipe.title === 'Soupe')!.missing.sort()).toEqual(['Beurre', 'Oignon'])
  })

  it('matches multi-word staples but not coincidental substrings', () => {
    const poultry = { title: 'Volaille', ingredients: ['Volaille rôtie', 'Thym'] }
    // "ail" (garlic) must NOT match "volaille"
    expect(rankCookable([poultry], ['Ail'], [])[0].missing).toEqual([])
    // "sauce tomate" should match the spaghetti's "1 pot de sauce tomate"
    expect(rankCookable([R.spag], ['Sauce tomate'], [])[0].missing).toEqual(['Sauce tomate'])
  })
})
