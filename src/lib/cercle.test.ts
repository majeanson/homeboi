import { describe, it, expect } from 'vitest'
import {
  RELATIONSHIP_INVERSES,
  ALL_RELATIONSHIP_TYPES,
  detectFamilyGroups,
  generationOf,
  buildPeople,
  unifyCircle,
  genderedRelLabel,
  personKey,
  daysUntilBirthday,
  ageOnNextBirthday,
  parseBirthday,
  formatBirthday,
  type Contact,
  type ContactLink,
  type Member,
  type RelationshipType,
} from './cercle'

// Test helpers: a minimal contact, a minimal member, and a link (contact↔contact
// unless kinds given).
const contact = (id: string, firstName: string, lastName = ''): Contact => ({
  id,
  firstName,
  lastName,
  nickname: null,
  photoKey: null,
  birthday: null,
  email: null,
  phone: null,
  address: null,
  notes: null,
  tags: [],
  memberId: null,
  customFields: [],
  gender: null,
})
const member = (id: string, displayName: string): Member => ({
  id,
  displayName,
  avatarKind: 'color',
  avatarRef: '#abc',
  colour: '#abc',
  isChild: false,
  email: null,
  phone: null,
  birthday: null,
  notes: null,
  gender: null,
})
const link = (
  aId: string,
  bId: string,
  type: RelationshipType,
  opts?: { aKind?: 'contact' | 'member'; bKind?: 'contact' | 'member' },
): ContactLink => ({
  id: `${aId}-${bId}`,
  personAId: aId,
  personAKind: opts?.aKind ?? 'contact',
  personBId: bId,
  personBKind: opts?.bKind ?? 'contact',
  type,
  reverseType: RELATIONSHIP_INVERSES[type],
  label: null,
  notes: null,
})
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

describe('detectFamilyGroups (Union-Find over unified people)', () => {
  const fam = (n: string) => (n ? `${n} family` : 'Family')
  const k = (id: string) => personKey('contact', id)

  it('merges people connected by family edges, ignores friend/colleague edges', () => {
    const people = buildPeople([contact('a', 'Ana', 'Roy'), contact('b', 'Bo', 'Roy'), contact('c', 'Cy', 'Roy'), contact('z', 'Zoe', 'Lee')], [])
    const links = [link('a', 'b', 'parent'), link('b', 'c', 'sibling'), link('a', 'z', 'friend')]
    const groups = detectFamilyGroups(people, links, fam)
    // One family of {a,b,c}; z is alone (friend doesn't bind) → filtered out (size 1).
    expect(groups).toHaveLength(1)
    expect([...groups[0].memberKeys].sort()).toEqual([k('a'), k('b'), k('c')])
  })

  it('binds a household MEMBER and a contact into the same family', () => {
    const people = buildPeople([contact('c1', 'Mémé')], [member('m1', 'Léa')])
    // m1 (member) is the grandparent of c1 (contact) — cross-kind family edge.
    const links = [link('m1', 'c1', 'grandparent', { aKind: 'member', bKind: 'contact' })]
    const groups = detectFamilyGroups(people, links, fam)
    expect(groups).toHaveLength(1)
    expect([...groups[0].memberKeys].sort()).toEqual([personKey('contact', 'c1'), personKey('member', 'm1')].sort())
  })

  it('returns no group when nobody is linked', () => {
    expect(detectFamilyGroups(buildPeople([contact('a', 'Ana'), contact('b', 'Bo')], []), [], fam)).toHaveLength(0)
  })
})

describe('unifyCircle (a member + its hard-linked contact are ONE person)', () => {
  const mk = (id: string) => personKey('member', id)
  const ck = (id: string) => personKey('contact', id)
  const linked = (id: string, first: string, memberId: string, extra: Partial<Contact> = {}): Contact => ({
    ...contact(id, first),
    memberId,
    ...extra,
  })

  it('absorbs the linked contact into its member and fills gender from the contact', () => {
    const people = unifyCircle([linked('c1', 'Marie', 'm1', { gender: 'f' })], [member('m1', 'Marie')], [], []).people
    expect(people).toHaveLength(1) // one human, not two
    expect(people[0].key).toBe(mk('m1')) // the member is canonical
    expect(people[0].gender).toBe('f') // gender carried over from the contact
  })

  it('remaps a contact-keyed link onto the member', () => {
    const { links } = unifyCircle(
      [linked('c1', 'Marie', 'm1'), contact('c2', 'Bo')],
      [member('m1', 'Marie')],
      [link('c1', 'c2', 'parent')],
      [],
    )
    expect(links).toHaveLength(1)
    expect(personKey(links[0].personAKind, links[0].personAId)).toBe(mk('m1'))
    expect(personKey(links[0].personBKind, links[0].personBId)).toBe(ck('c2'))
  })

  it('drops a tie that collapses onto the same person', () => {
    const self = link('m1', 'c1', 'sibling', { aKind: 'member', bKind: 'contact' })
    expect(unifyCircle([linked('c1', 'Marie', 'm1')], [member('m1', 'Marie')], [self], []).links).toHaveLength(0)
  })

  it('remaps group membership onto the member, de-duping within the group', () => {
    const { groups } = unifyCircle([linked('c1', 'Marie', 'm1')], [member('m1', 'Marie')], [], [
      {
        id: 'g1',
        name: 'Fam',
        kind: 'family',
        colour: null,
        memberKeys: [
          { personId: 'c1', personKind: 'contact' },
          { personId: 'm1', personKind: 'member' },
        ],
      },
    ])
    expect(groups[0].memberKeys).toEqual([{ personId: 'm1', personKind: 'member' }])
  })

  it('is a thin pass-through when no contact is linked', () => {
    expect(unifyCircle([contact('c1', 'A')], [member('m1', 'B')], [], []).people).toHaveLength(2)
  })
})

describe('generationOf', () => {
  it('places parents above children and spouses on the same band', () => {
    const people = buildPeople([contact('gp', 'Pépé'), contact('p', 'Papa'), contact('m', 'Maman'), contact('k', 'Léa')], [])
    const links = [
      link('gp', 'p', 'parent'), // Pépé parent of Papa
      link('p', 'm', 'spouse'), // Papa spouse of Maman
      link('p', 'k', 'parent'), // Papa parent of Léa
    ]
    const gen = generationOf(people, links)
    const g = (id: string) => gen.get(personKey('contact', id))!
    expect(g('p')).toBe(g('gp') + 1) // child one below parent
    expect(g('k')).toBe(g('p') + 1)
    expect(g('m')).toBe(g('p')) // spouse same band
  })

  it('omits people with no family edge', () => {
    const people = buildPeople([contact('a', 'Ana'), contact('lonely', 'Solo')], [])
    const gen = generationOf(people, [link('a', 'a2', 'sibling')]) // a2 not present → no edge placed
    expect(gen.has(personKey('contact', 'lonely'))).toBe(false)
  })
})

describe('genderedRelLabel (the label describes the SUBJECT, gendered by THEIR sex)', () => {
  it('genders the common family roles in FR', () => {
    expect(genderedRelLabel('parent', 'f', 'fr')).toBe('Mère')
    expect(genderedRelLabel('parent', 'm', 'fr')).toBe('Père')
    expect(genderedRelLabel('child', 'f', 'fr')).toBe('Fille')
    expect(genderedRelLabel('child', 'm', 'fr')).toBe('Fils')
    expect(genderedRelLabel('sibling', 'f', 'fr')).toBe('Sœur')
    expect(genderedRelLabel('sibling', 'm', 'fr')).toBe('Frère')
    expect(genderedRelLabel('aunt_uncle', 'f', 'fr')).toBe('Tante')
    expect(genderedRelLabel('aunt_uncle', 'm', 'fr')).toBe('Oncle')
    expect(genderedRelLabel('niece_nephew', 'f', 'fr')).toBe('Nièce')
    expect(genderedRelLabel('niece_nephew', 'm', 'fr')).toBe('Neveu')
  })

  it('falls back to the neutral label when the gender is unknown', () => {
    expect(genderedRelLabel('parent', null, 'fr')).toBe('Parent')
    expect(genderedRelLabel('sibling', null, 'fr')).toBe('Frère / sœur')
    expect(genderedRelLabel('child', null, 'en')).toBe('Child')
  })

  it('genders in EN too', () => {
    expect(genderedRelLabel('parent', 'f', 'en')).toBe('Mother')
    expect(genderedRelLabel('sibling', 'm', 'en')).toBe('Brother')
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
