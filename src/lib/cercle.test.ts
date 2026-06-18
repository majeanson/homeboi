import { describe, it, expect } from 'vitest'
import {
  RELATIONSHIP_INVERSES,
  ALL_RELATIONSHIP_TYPES,
  detectFamilyGroups,
  daysUntilBirthday,
  ageOnNextBirthday,
  parseBirthday,
  formatBirthday,
  type RelationshipType,
} from './cercle'
import { INVERSES as SERVER_INVERSES } from '../../functions/_lib/cercleRelations'

describe('relationship inverses', () => {
  it('every type has an inverse, and inverse-of-inverse is identity', () => {
    for (const ty of ALL_RELATIONSHIP_TYPES) {
      const inv = RELATIONSHIP_INVERSES[ty]
      expect(inv, ty).toBeDefined()
      expect(RELATIONSHIP_INVERSES[inv], `inverse² of ${ty}`).toBe(ty)
    }
  })

  // The Worker can't import the SPA map, so functions/api/cercle-links.ts keeps a
  // duplicate. This pins the two together so a future edit can't desync the edge.
  it('the server-side copy matches the client map exactly', () => {
    expect(SERVER_INVERSES).toEqual(RELATIONSHIP_INVERSES)
  })
})

describe('detectFamilyGroups (Union-Find)', () => {
  const fam = (n: string) => (n ? `${n} family` : 'Family')
  it('merges people connected by family edges, ignores friend/colleague edges', () => {
    const contacts = [
      { id: 'a', firstName: 'Ana', lastName: 'Roy' },
      { id: 'b', firstName: 'Bo', lastName: 'Roy' },
      { id: 'c', firstName: 'Cy', lastName: 'Roy' },
      { id: 'z', firstName: 'Zoe', lastName: 'Lee' }, // only a friend link → own (lonely) group
    ]
    const links = [
      { personAId: 'a', personBId: 'b', type: 'parent' as RelationshipType },
      { personAId: 'b', personBId: 'c', type: 'sibling' as RelationshipType },
      { personAId: 'a', personBId: 'z', type: 'friend' as RelationshipType },
    ]
    const groups = detectFamilyGroups(contacts, links, fam)
    // One family of {a,b,c}; z is alone (friend doesn't bind) → filtered out (size 1).
    expect(groups).toHaveLength(1)
    expect([...groups[0].memberIds].sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns no group when nobody is linked', () => {
    const contacts = [
      { id: 'a', firstName: 'Ana', lastName: 'Roy' },
      { id: 'b', firstName: 'Bo', lastName: 'Lee' },
    ]
    expect(detectFamilyGroups(contacts, [], fam)).toHaveLength(0)
  })
})

describe('birthday math', () => {
  const dec1 = new Date(2026, 11, 1) // 1 Dec 2026 (local)

  it('parses year-known and year-unknown forms', () => {
    expect(parseBirthday('1990-03-12')).toEqual({ year: 1990, month: 3, day: 12, yearKnown: true })
    expect(parseBirthday('0000-03-12')?.yearKnown).toBe(false)
    expect(parseBirthday('nope')).toBeNull()
  })

  it('counts days to the next occurrence (today = 0)', () => {
    expect(daysUntilBirthday('2000-12-01', dec1)).toBe(0)
    expect(daysUntilBirthday('2000-12-05', dec1)).toBe(4)
    // A past month this year rolls to next year.
    expect(daysUntilBirthday('2000-11-30', dec1)).toBe(364)
  })

  it('computes the age turned only when the year is known', () => {
    expect(ageOnNextBirthday('2000-12-05', dec1)).toBe(26)
    expect(ageOnNextBirthday('0000-12-05', dec1)).toBeNull()
  })

  it('formats day + month without the year', () => {
    expect(formatBirthday('1990-03-12', 'fr')).toBe('12 mars')
    expect(formatBirthday('1990-03-12', 'en')).toBe('March 12')
  })
})
