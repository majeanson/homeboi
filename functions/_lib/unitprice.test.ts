import { describe, it, expect } from 'vitest'
import { computeUnitPrice, stripProductCode } from './unitprice'

describe('computeUnitPrice', () => {
  it('reads a volume size from the name (per litre)', () => {
    const r = computeUnitPrice({ price: 6.69, name: 'Natrel Organic Milk 3% 2L' })
    expect(r?.unitKind).toBe('volume')
    expect(r?.unitLabel).toBe('/L')
    expect(r?.unitPrice).toBeCloseTo(3.345, 2)
  })

  it('reads a mass size and normalizes to per kilogram', () => {
    const r = computeUnitPrice({ price: 5, name: 'poitrines de poulet 500 g' })
    expect(r?.unitKind).toBe('mass')
    expect(r?.unitLabel).toBe('/kg')
    expect(r?.unitPrice).toBeCloseTo(10, 5)
  })

  it('falls back to post_price_text when the name has no size', () => {
    const r = computeUnitPrice({ price: 3.99, name: 'SILK LAIT AMANDES', postPriceText: '|1.89 L' })
    expect(r?.unitKind).toBe('volume')
    expect(r?.unitPrice).toBeCloseTo(2.11, 2)
  })

  it('handles a multi-buy (2/) by dividing to per-each', () => {
    // 2 for $7.00, 1 L each -> $3.50/L
    const r = computeUnitPrice({ price: 7.0, name: 'jus 1L', prePriceText: '2/' })
    expect(r?.unitPrice).toBeCloseTo(3.5, 2)
  })

  it('handles an N x size pack', () => {
    // 6 x 355 mL = 2130 mL = 2.13 L; $5.99 -> ~$2.81/L
    const r = computeUnitPrice({ price: 5.99, name: 'boisson 6 x 355 ml' })
    expect(r?.unitKind).toBe('volume')
    expect(r?.unitPrice).toBeCloseTo(2.812, 2)
  })

  it('converts pounds to kilograms', () => {
    // $2/lb -> $4.41/kg
    const r = computeUnitPrice({ price: 2, name: 'pommes 1 lb' })
    expect(r?.unitKind).toBe('mass')
    expect(r?.unitPrice).toBeCloseTo(4.409, 2)
  })

  it('returns null when no size is stated', () => {
    expect(computeUnitPrice({ price: 5.99, name: 'LACTANTIA LAIT SANS LACTOSE' })).toBeNull()
  })

  it('returns null when there is no price', () => {
    expect(computeUnitPrice({ price: null, name: 'lait 2L' })).toBeNull()
  })

  it('does not mistake a percentage for a size', () => {
    // "3%" must not parse; "2L" must.
    const r = computeUnitPrice({ price: 4, name: 'lait 3% 2L' })
    expect(r?.unitLabel).toBe('/L')
    expect(r?.unitPrice).toBeCloseTo(2, 5)
  })

  it('ignores a leading product/SKU code rather than reading it as a size', () => {
    // The "994949 FROMAGE … → $0.01/kg" bug: the leading SKU is not a size, and
    // there is no real size in the name, so no unit price.
    expect(computeUnitPrice({ price: 9.49, name: '994949 FROMAGE BRIE OU CAMEMBERT' })).toBeNull()
  })

  it('still reads a real size that sits after a leading SKU code', () => {
    const r = computeUnitPrice({ price: 5, name: '123456 poitrines de poulet 500 g' })
    expect(r?.unitKind).toBe('mass')
    expect(r?.unitPrice).toBeCloseTo(10, 5)
  })

  it('rejects an implausibly large size instead of emitting an absurd unit price', () => {
    // What the AI sniper would feed back if it read the SKU "994949" as grams.
    expect(computeUnitPrice({ price: 9.49, name: '994949 g' })).toBeNull()
  })
})

describe('stripProductCode', () => {
  it('drops a leading 5+ digit SKU code', () => {
    expect(stripProductCode('994949 FROMAGE BRIE')).toBe('FROMAGE BRIE')
  })

  it('keeps a leading 4-digit size like a bottle volume', () => {
    expect(stripProductCode('1000 ml jus')).toBe('1000 ml jus')
  })

  it('leaves a name with no leading code untouched', () => {
    expect(stripProductCode('poitrines de poulet 500 g')).toBe('poitrines de poulet 500 g')
  })
})
