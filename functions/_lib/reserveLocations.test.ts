import { describe, it, expect } from 'vitest'
import { cleanReserveLocations } from './reserveLocations'

// The validator is the one gate between an untrusted PATCH body / a stored JSON
// blob and the kitchen render — so a malformed entry must never survive.
describe('cleanReserveLocations', () => {
  it('keeps valid {id, name, color} entries and lower-cases the hex', () => {
    expect(cleanReserveLocations([{ id: 'pantry', name: 'Garde-manger', color: '#E0A93D' }])).toEqual([
      { id: 'pantry', name: 'Garde-manger', color: '#e0a93d' },
    ])
  })

  it('allows a colourless location', () => {
    expect(cleanReserveLocations([{ id: 'x', name: 'Cave à légumes' }])).toEqual([{ id: 'x', name: 'Cave à légumes' }])
  })

  it('drops a bad hex but keeps the location', () => {
    expect(cleanReserveLocations([{ id: 'x', name: 'Frigo', color: 'red' }])).toEqual([{ id: 'x', name: 'Frigo' }])
  })

  it('drops entries with no id or no name', () => {
    expect(cleanReserveLocations([{ id: '', name: 'A' }, { id: 'b', name: '' }, { id: 'c', name: 'C' }])).toEqual([
      { id: 'c', name: 'C' },
    ])
  })

  it('de-dupes by id (first wins)', () => {
    expect(cleanReserveLocations([{ id: 'a', name: 'First' }, { id: 'a', name: 'Second' }])).toEqual([
      { id: 'a', name: 'First' },
    ])
  })

  it('trims and caps the name and id length', () => {
    const long = 'x'.repeat(80)
    const [out] = cleanReserveLocations([{ id: '  a  ', name: `  ${long}  ` }])
    expect(out.id).toBe('a')
    expect(out.name.length).toBe(40)
  })

  it('caps the list at 12 entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `id${i}`, name: `n${i}` }))
    expect(cleanReserveLocations(many)).toHaveLength(12)
  })

  it('returns an empty array for non-array / garbage input', () => {
    expect(cleanReserveLocations(null)).toEqual([])
    expect(cleanReserveLocations('nope')).toEqual([])
    expect(cleanReserveLocations([1, 'x', null, {}])).toEqual([])
  })
})
