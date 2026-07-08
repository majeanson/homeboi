import { describe, expect, it } from 'vitest'
import { rankJoindre, type JoindreBusinessInput, type JoindreCandidate } from './joindre'

// A-6 (bmad/10): the « Joindre » rail's pure ranking.

const person = (over: Partial<JoindreCandidate> & { key: string; firstName: string }): JoindreCandidate => ({
  kind: 'contact',
  name: over.firstName,
  phone: null,
  email: null,
  avatarKind: null,
  avatarRef: null,
  colour: null,
  ...over,
})

const biz = (over: Partial<JoindreBusinessInput> & { id: string; name: string }): JoindreBusinessInput => ({
  phone: null,
  email: null,
  colour: null,
  ...over,
})

describe('rankJoindre', () => {
  it('eligibility: keeps only a phone OR an email, drops neither', () => {
    const people = [
      person({ key: 'contact:a', firstName: 'Aline', phone: '514-555-0001' }),
      person({ key: 'contact:b', firstName: 'Boris', email: 'boris@ex.ca' }),
      person({ key: 'contact:c', firstName: 'Chloé' }), // neither — never a candidate
    ]
    const ranked = rankJoindre(people, [], {})
    expect(ranked.map((r) => r.key).sort()).toEqual(['contact:a', 'contact:b'])
  })

  it('cold start: urgence-tagged beats a member-with-phone beats a business beats everyone else', () => {
    const people = [
      person({ key: 'contact:other', firstName: 'Zoé', phone: '1' }), // tier 3 (others)
      person({ key: 'member:parent', firstName: 'Marc', kind: 'member', phone: '2' }), // tier 1
      person({ key: 'contact:urgence', firstName: 'Denise', phone: '3', tags: ['urgence'] }), // tier 0
    ]
    const businesses = [biz({ id: 'vet', name: 'Vétérinaire Nord', phone: '4' })] // tier 2
    const ranked = rankJoindre(people, businesses, {})
    expect(ranked.map((r) => r.key)).toEqual(['contact:urgence', 'member:parent', 'business:vet', 'contact:other'])
  })

  it('a business tag never counts as urgence (urgence is a contact-only signal)', () => {
    const businesses = [biz({ id: 'b1', name: 'Ambulance', phone: '1' })]
    const people = [person({ key: 'member:m', firstName: 'Amie', kind: 'member', phone: '2' })]
    const ranked = rankJoindre(people, businesses, {})
    // Member-with-phone (tier 1) still beats the business (tier 2), even one named
    // "Ambulance" that would alphabetically sort first.
    expect(ranked[0].key).toBe('member:m')
  })

  it('alphabetical by first name within a tier', () => {
    const people = [
      person({ key: 'contact:z', firstName: 'Zack', phone: '1' }),
      person({ key: 'contact:a', firstName: 'Awa', phone: '2' }),
      person({ key: 'contact:m', firstName: 'Mona', phone: '3' }),
    ]
    const ranked = rankJoindre(people, [], {})
    expect(ranked.map((r) => r.firstName)).toEqual(['Awa', 'Mona', 'Zack'])
  })

  it('frequent score outranks the cold-start tier entirely', () => {
    const people = [
      person({ key: 'contact:urgence', firstName: 'Denise', phone: '1', tags: ['urgence'] }), // tier 0, no score
      person({ key: 'member:m', firstName: 'Marc', kind: 'member', phone: '2' }), // tier 1, scored
    ]
    const ranked = rankJoindre(people, [], { 'member:m': 5 })
    expect(ranked[0].key).toBe('member:m')
  })

  it('business key is prefixed business:<id>', () => {
    const ranked = rankJoindre([], [biz({ id: 'plombier-1', name: 'Plomberie A', phone: '1' })], {})
    expect(ranked[0].key).toBe('business:plombier-1')
  })

  it('caps the ranked list to 8', () => {
    const people = Array.from({ length: 12 }, (_, i) =>
      person({ key: `contact:${i}`, firstName: `P${i}`, phone: `${i}` }),
    )
    expect(rankJoindre(people, [], {})).toHaveLength(8)
  })

  it('empty input ranks to nothing, never throws', () => {
    expect(rankJoindre([], [], {})).toEqual([])
  })
})
