import { describe, expect, it } from 'vitest'
import { dealPriceWords, money } from './deals'

// Review #14: a priceless flyer item reached the till as a blank where the price goes.
// (The server half, what the ad says in words, is priceTextOf in functions/_lib/unitprice.)
describe('dealPriceWords (never a blank)', () => {
  it('the price when there is one', () => {
    expect(dealPriceWords({ price: 4.99 }, 'fr', 'Voir la circulaire')).toBe(money(4.99, 'fr'))
  })
  it('else the ad’s words, else the flyer', () => {
    expect(dealPriceWords({ price: null, priceText: '2 / 5 $' }, 'fr', 'Voir la circulaire')).toBe('2 / 5 $')
    expect(dealPriceWords({ price: null }, 'fr', 'Voir la circulaire')).toBe('Voir la circulaire')
  })
})
