import { describe, it, expect } from 'vitest'
import { filterComboOptions, type ComboOption } from './EntityCombobox'

const opt = (id: string, label: string, keywords?: string[], group?: string): ComboOption<null> => ({
  id,
  label,
  data: null,
  keywords,
  group,
})

describe('filterComboOptions (type-to-filter rank)', () => {
  it('ranks a name match above a keyword-only match, keeping each tier in caller order', () => {
    // The meal-slot bug: « poulet » led with recipes that merely CONTAIN chicken
    // because the cookable ranking survived the filter untouched.
    const options = [
      opt('quinoa', 'Bol de quinoa au halloumi', ['poulet', 'quinoa']),
      opt('chaudree', 'Chaudrée de patate douce et poulet', ['patate douce']),
      opt('cobbler', 'Cobbler poulet red lobster', ['poulet']),
      opt('tacos', 'Tacos au boeuf', ['boeuf']),
    ]
    expect(filterComboOptions(options, 'poulet').map((o) => o.id)).toEqual([
      'chaudree',
      'cobbler',
      'quinoa',
    ])
  })

  it('matches accent- and case-insensitively in both tiers', () => {
    const options = [opt('a', 'Pâté chinois'), opt('b', 'Riz frit', ['pâté'])]
    expect(filterComboOptions(options, 'pate').map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('partitions within each group block so headings stay contiguous', () => {
    // Day editor mix: a keyword-only recipe must trail the named recipes but
    // still sit BEFORE the leftovers block — never interleave the groups.
    const options = [
      opt('r1', 'Soupe thaï', ['poulet'], 'Recettes'),
      opt('r2', 'Poulet au beurre', [], 'Recettes'),
      opt('l1', 'Restant de poulet', [], 'Restes'),
    ]
    expect(filterComboOptions(options, 'poulet').map((o) => o.id)).toEqual(['r2', 'r1', 'l1'])
  })

  it('returns the list untouched for a blank needle', () => {
    const options = [opt('a', 'Un'), opt('b', 'Deux')]
    expect(filterComboOptions(options, '  ')).toBe(options)
  })

  it('drops options matching neither name nor keywords', () => {
    const options = [opt('a', 'Salade', ['laitue'])]
    expect(filterComboOptions(options, 'poulet')).toEqual([])
  })
})
