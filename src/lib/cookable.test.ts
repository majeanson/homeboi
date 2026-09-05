import { describe, it, expect } from 'vitest'
import { normKey, rankCookable, rankNeglected } from './cookable'

const R = {
  spag: { title: 'Spaghetti', ingredients: ['400 g de pâtes', '1 pot de sauce tomate', '500 g de bœuf', '1 oignon'] },
  taco: { title: 'Tacos', ingredients: ['Tortillas', 'Poulet', 'Salsa', 'Laitue'] },
  soup: { title: 'Soupe', ingredients: ['Beurre', 'Oignon', 'Bouillon'] },
}

describe('normKey', () => {
  // A regex alternation takes the FIRST branch that matches, not the longest, and
  // 'l' was listed before 'lb': « 2 lb de pommes » normalised to « b de pommes », so a
  // flyer deal never linked onto a line written with pounds. Found while making the
  // deal-zoom caption stop printing the product name twice (sameItemName).
  it('matches the LONGEST unit, not the first one that fits', () => {
    expect(normKey('2 lb de pommes')).toBe('pommes')
    expect(normKey('2 lbs de pommes')).toBe('pommes')
    expect(normKey('1 l de lait')).toBe('lait')
    expect(normKey('250 gr de beurre')).toBe('beurre')
  })

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

describe('rankNeglected', () => {
  const DAY = 86400
  const today = 100 * DAY // arbitrary local-midnight anchor
  const recipes = [
    { id: 'a', title: 'Spaghetti' },
    { id: 'b', title: 'Tacos' },
    { id: 'c', title: 'Soupe' },
  ]

  it('orders never-served first, then longest-gap first', () => {
    // a served 5 days ago, b served 30 days ago, c never served (absent).
    const last = new Map<string, number>([
      ['a', today - 5 * DAY],
      ['b', today - 30 * DAY],
    ])
    const ranked = rankNeglected(recipes, last, today)
    expect(ranked.map((r) => r.recipe.id)).toEqual(['c', 'b', 'a'])
    expect(ranked.map((r) => r.daysSince)).toEqual([null, 30, 5])
  })

  it('computes whole-day gaps and never goes negative', () => {
    const last = new Map<string, number>([['a', today - 25 * DAY]])
    const ranked = rankNeglected([recipes[0]], last, today)
    expect(ranked[0].daysSince).toBe(25)
    // A future-dated serving (planned ahead) clamps to 0, not a negative gap.
    const future = new Map<string, number>([['a', today + 3 * DAY]])
    expect(rankNeglected([recipes[0]], future, today)[0].daysSince).toBe(0)
  })

  it('breaks ties on title for a stable order', () => {
    const last = new Map<string, number>([
      ['a', today - 10 * DAY],
      ['b', today - 10 * DAY],
    ])
    // Equal gaps → alphabetical by title (Spaghetti before Tacos).
    const ranked = rankNeglected([recipes[1], recipes[0]], last, today)
    expect(ranked.map((r) => r.recipe.title)).toEqual(['Spaghetti', 'Tacos'])
  })
})
