import { describe, it, expect } from 'vitest'
import { aisleFor, aisleKey, aisleRanks, DEFAULT_AISLE_ORDER, AISLES } from './aisle'

describe('aisleFor — free-text → aisle (reuses pictoFor keywords)', () => {
  it('classifies common groceries FR + EN', () => {
    expect(aisleFor('pomme')).toBe('produce')
    expect(aisleFor('2% milk')).toBe('dairy')
    expect(aisleFor('lait')).toBe('dairy')
    expect(aisleFor('oeufs')).toBe('dairy') // eggs ride with dairy
    expect(aisleFor('pain tranché')).toBe('bakery')
    expect(aisleFor('poulet')).toBe('meat')
    expect(aisleFor('saumon')).toBe('meat')
    expect(aisleFor('riz')).toBe('pantry')
    expect(aisleFor('biscuits')).toBe('snacks')
    expect(aisleFor('café')).toBe('drinks')
    expect(aisleFor('lessive')).toBe('household')
  })

  it('falls back to "autres" for anything it cannot place', () => {
    expect(aisleFor('blablabla')).toBe('autres')
    expect(aisleFor('')).toBe('autres')
    expect(aisleFor('truc bidule')).toBe('autres')
  })

  it('a per-item override beats the keyword guess', () => {
    expect(aisleFor('granola')).toBe('autres') // no keyword match
    const ov = { [aisleKey('granola')]: 'snacks' as const }
    expect(aisleFor('granola', ov)).toBe('snacks')
  })

  it('overrides stick by an accent/quantity-insensitive key', () => {
    const ov = { [aisleKey('oeufs')]: 'bakery' as const }
    // "2 douzaines d'œufs" normalizes to the same key as "oeufs".
    expect(aisleKey("2 douzaines d'œufs")).toBe(aisleKey('oeufs'))
    expect(aisleFor("2 douzaines d'œufs", ov)).toBe('bakery')
  })
})

describe('aisleRanks — saved order → sortable ranks', () => {
  it('ranks by the saved order and always pins "autres" last', () => {
    const ranks = aisleRanks(['meat', 'produce', 'dairy'])
    expect(ranks.meat).toBeLessThan(ranks.produce)
    expect(ranks.produce).toBeLessThan(ranks.dairy)
    // 'autres' is pinned last regardless of where (or whether) it appears.
    for (const a of AISLES) if (a.id !== 'autres') expect(ranks.autres).toBeGreaterThan(ranks[a.id])
  })

  it('completes a partial order with the remaining aisles in default order', () => {
    const ranks = aisleRanks(['drinks'])
    expect(ranks.drinks).toBe(0)
    // every built-in aisle still gets a finite, distinct-ish rank
    for (const a of AISLES) expect(typeof ranks[a.id]).toBe('number')
  })

  it('null/empty falls back to the default order', () => {
    const ranks = aisleRanks(null)
    expect(ranks[DEFAULT_AISLE_ORDER[0]]).toBe(0)
  })
})
