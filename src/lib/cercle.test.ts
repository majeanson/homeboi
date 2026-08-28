import { describe, it, expect } from 'vitest'
import {
  RELATIONSHIP_INVERSES,
  ALL_RELATIONSHIP_TYPES,
  detectFamilyGroups,
  generationOf,
  buildPeople,
  unifyCircle,
  genderedRelLabel,
  familyLinksFromBands,
  familyLinksFromMatrix,
  bandsFromLinks,
  dedupeNewLinks,
  closedLinks,
  friendLinksFromGroups,
  proposeFamilyLinks,
  proposeAllFamilyLinks,
  parsePersonKey,
  personKey,
  petOwners,
  isHouseholdPet,
  familyReachableKeys,
  worldClustersFrom,
  buildWorld,
  islandFaceLayout,
  layoutIslands,
  layoutFamilyForest,
  daysUntilBirthday,
  ageOnNextBirthday,
  parseBirthday,
  formatBirthday,
  type Contact,
  type ContactLink,
  type Member,
  type Pet,
  type PersonKind,
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

describe('family builder engine', () => {
  const k = (id: string) => personKey('contact', id)
  // A tie between two keys, ignoring direction, as "type" or undefined if absent.
  const tieOf = (links: { aKey: string; bKey: string; type: string }[], a: string, b: string) =>
    links.find((l) => (l.aKey === a && l.bKey === b) || (l.aKey === b && l.bKey === a))?.type

  it('parsePersonKey round-trips personKey', () => {
    expect(parsePersonKey(personKey('member', 'm1'))).toEqual({ kind: 'member', id: 'm1' })
    expect(parsePersonKey(personKey('contact', 'c1'))).toEqual({ kind: 'contact', id: 'c1' })
  })

  it('bands: parents→children parent, children siblings, two parents spouse', () => {
    const links = familyLinksFromBands({ grandparents: [], parents: [k('pa'), k('ma')], children: [k('x'), k('y')] })
    expect(tieOf(links, k('pa'), k('x'))).toBe('parent')
    expect(tieOf(links, k('ma'), k('y'))).toBe('parent')
    expect(tieOf(links, k('x'), k('y'))).toBe('sibling')
    expect(tieOf(links, k('pa'), k('ma'))).toBe('spouse')
  })

  it('bands: grandparents link to children as grandparent, not to parents', () => {
    const links = familyLinksFromBands({ grandparents: [k('gp')], parents: [k('pa')], children: [k('kid')] })
    expect(tieOf(links, k('gp'), k('kid'))).toBe('grandparent')
    expect(tieOf(links, k('gp'), k('pa'))).toBeUndefined() // side is ambiguous — never guessed
  })

  it('bands: a lone parent gets NO spouse edge (ambiguous)', () => {
    const links = familyLinksFromBands({ grandparents: [], parents: [k('solo')], children: [k('kid')] })
    expect(links.some((l) => l.type === 'spouse')).toBe(false)
    expect(tieOf(links, k('solo'), k('kid'))).toBe('parent')
  })

  it('matrix: each person is [type] of the anchor; skipped picks dropped', () => {
    const links = familyLinksFromMatrix(k('me'), [
      { key: k('mum'), type: 'parent' },
      { key: k('bro'), type: 'sibling' },
      { key: k('nobody'), type: null },
      { key: k('me'), type: 'parent' }, // self — ignored
    ])
    expect(links).toHaveLength(2)
    expect(links).toContainEqual({ aKey: k('mum'), bKey: k('me'), type: 'parent' })
    expect(links).toContainEqual({ aKey: k('bro'), bKey: k('me'), type: 'sibling' })
  })

  it('bandsFromLinks round-trips familyLinksFromBands (an existing family pre-places)', () => {
    const roster = [k('gp'), k('pa'), k('ma'), k('x'), k('y')]
    const gen = familyLinksFromBands({ grandparents: [k('gp')], parents: [k('pa'), k('ma')], children: [k('x'), k('y')] })
    // GeneratedLink → ContactLink shape the builder actually stores.
    const stored = gen.map((g) => link(parsePersonKey(g.aKey).id, parsePersonKey(g.bKey).id, g.type))
    expect(bandsFromLinks(roster, stored)).toEqual({
      [k('gp')]: 'grandparents',
      [k('pa')]: 'parents',
      [k('ma')]: 'parents', // reached sideways via the spouse tie
      [k('x')]: 'children',
      [k('y')]: 'children', // reached sideways via the sibling tie
    })
  })

  it('bandsFromLinks: a grandparent tie keeps the grandparent rung, never demoted to parent', () => {
    const bands = bandsFromLinks([k('gp'), k('kid')], [link('gp', 'kid', 'grandparent')])
    expect(bands).toEqual({ [k('gp')]: 'grandparents', [k('kid')]: 'children' })
  })

  it('bandsFromLinks: a person with no generational tie stays un-placed (tray)', () => {
    const bands = bandsFromLinks([k('pa'), k('kid'), k('loner')], [link('pa', 'kid', 'parent')])
    expect(bands).toEqual({ [k('pa')]: 'parents', [k('kid')]: 'children' })
    expect(bands[k('loner')]).toBeUndefined()
  })

  it('dedupeNewLinks skips pairs already linked (either direction)', () => {
    const existing = [link('a', 'b', 'parent')] // contact a ↔ b
    const fresh = dedupeNewLinks(
      [
        { aKey: k('b'), bKey: k('a'), type: 'sibling' }, // same pair, reversed → skip
        { aKey: k('a'), bKey: k('c'), type: 'parent' }, // new → keep
      ],
      existing,
    )
    expect(fresh).toEqual([{ aKey: k('a'), bKey: k('c'), type: 'parent' }])
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

describe('closedLinks (relationship closure / propagation)', () => {
  const k = (id: string) => personKey('contact', id)
  // The set of `type:otherId` ties a person has in the closed set, read from THEIR
  // perspective (so a child of P reads 'child:P', a grandchild of G reads 'grandchild:G').
  const relsOf = (closed: ContactLink[], id: string): Set<string> => {
    const key = k(id)
    const out = new Set<string>()
    for (const l of closed) {
      const a = personKey(l.personAKind, l.personAId)
      const b = personKey(l.personBKind, l.personBId)
      if (a === key) out.add(`${l.type}:${parsePersonKey(b).id}`)
      else if (b === key) out.add(`${l.reverseType}:${parsePersonKey(a).id}`)
    }
    return out
  }
  const ppl = (...ids: string[]) => buildPeople(ids.map((id) => contact(id, id)), [])

  it("propagates a sibling's parent and grandparent to all siblings (the matrix-anchor case)", () => {
    // Everything entered against ONE anchor (Olivier), as the matrix builder does:
    //   Colin is sibling of Olivier · Jérémie is parent of Olivier · Jacques is grandparent of Olivier
    const people = ppl('olivier', 'colin', 'jeremie', 'jacques')
    const links = [
      link('colin', 'olivier', 'sibling'),
      link('jeremie', 'olivier', 'parent'),
      link('jacques', 'olivier', 'grandparent'),
    ]
    const colin = relsOf(closedLinks(people, links), 'colin')
    expect(colin.has('sibling:olivier')).toBe(true)
    expect(colin.has('child:jeremie')).toBe(true) // Jérémie propagated as Colin's parent
    expect(colin.has('grandchild:jacques')).toBe(true) // Jacques propagated as Colin's grandparent
  })

  it('derives grandparent from a parent-of-parent chain', () => {
    const people = ppl('gp', 'p', 'c')
    const closed = closedLinks(people, [link('gp', 'p', 'parent'), link('p', 'c', 'parent')])
    expect(relsOf(closed, 'c').has('grandchild:gp')).toBe(true)
    expect(relsOf(closed, 'gp').has('grandparent:c')).toBe(true)
  })

  it('derives aunt/uncle and cousin from a sibling-with-children', () => {
    // p1 & p2 are siblings; each has a child → p2 is c1's aunt/uncle, c1 & c2 are cousins.
    const people = ppl('p1', 'p2', 'c1', 'c2')
    const closed = closedLinks(people, [link('p1', 'p2', 'sibling'), link('p1', 'c1', 'parent'), link('p2', 'c2', 'parent')])
    expect(relsOf(closed, 'c1').has('niece_nephew:p2')).toBe(true)
    expect(relsOf(closed, 'c1').has('cousin:c2')).toBe(true)
  })

  it('closes siblings transitively (a~b, b~c ⟹ a~c)', () => {
    const people = ppl('a', 'b', 'c')
    const closed = closedLinks(people, [link('a', 'b', 'sibling'), link('b', 'c', 'sibling')])
    expect(relsOf(closed, 'a').has('sibling:c')).toBe(true)
  })

  it('NEVER derives spouse from co-parents (stays an opt-in suggestion)', () => {
    const people = ppl('a', 'b', 'c')
    const closed = closedLinks(people, [link('a', 'c', 'parent'), link('b', 'c', 'parent')])
    expect(relsOf(closed, 'a').has('spouse:b')).toBe(false)
    expect(relsOf(closed, 'a').has('partner:b')).toBe(false)
  })

  it('passes social/affinity ties through untouched and keeps stored ids', () => {
    const people = ppl('a', 'b')
    const closed = closedLinks(people, [link('a', 'b', 'friend')])
    expect(relsOf(closed, 'a').has('friend:b')).toBe(true)
    expect(closed.find((l) => l.type === 'friend')?.id).toBe('a-b') // the real stored id, not a derived one
  })

  it('marks purely derived ties with a derived: id', () => {
    const people = ppl('a', 'b', 'c')
    const closed = closedLinks(people, [link('a', 'b', 'sibling'), link('b', 'c', 'sibling')])
    const ac = closed.find(
      (l) =>
        (l.personAId === 'a' && l.personBId === 'c') || (l.personAId === 'c' && l.personBId === 'a'),
    )
    expect(ac?.id.startsWith('derived:')).toBe(true)
  })
})

describe('friendLinksFromGroups (friends-kind group → friend ties)', () => {
  const k = (id: string) => personKey('contact', id)
  const friendGroup = (id: string, ...ids: string[]) => ({
    id,
    name: id,
    kind: 'friends' as const,
    colour: null,
    memberKeys: new Set(ids.map(k)),
  })

  it('links every pair in a friends group as a friend, one undirected link per pair', () => {
    const out = friendLinksFromGroups([friendGroup('g1', 'a', 'b', 'c')], [])
    expect(out).toHaveLength(3) // a-b, a-c, b-c
    expect(out.every((l) => l.type === 'friend' && l.reverseType === 'friend')).toBe(true)
    expect(out.every((l) => l.id.startsWith('group-friend:'))).toBe(true)
  })

  it('only acts on friends-kind groups (family/work/other are ignored)', () => {
    const groups = [
      { id: 'fam', name: 'fam', kind: 'family' as const, colour: null, memberKeys: new Set([k('a'), k('b')]) },
      { id: 'work', name: 'work', kind: 'work' as const, colour: null, memberKeys: new Set([k('c'), k('d')]) },
    ]
    expect(friendLinksFromGroups(groups, [])).toHaveLength(0)
  })

  it('skips a pair that already has a stored tie of any type (explicit wins)', () => {
    const out = friendLinksFromGroups([friendGroup('g1', 'a', 'b', 'c')], [link('a', 'b', 'sibling')])
    expect(out).toHaveLength(2) // a-b is already tied → only a-c and b-c
    expect(out.some((l) => (l.personAId === 'a' && l.personBId === 'b') || (l.personAId === 'b' && l.personBId === 'a'))).toBe(false)
  })

  it('feeds through closedLinks as a passthrough friend tie', () => {
    const people = ppl('a', 'b')
    const groupFriends = friendLinksFromGroups([friendGroup('g1', 'a', 'b')], [])
    const closed = closedLinks(people, [...groupFriends])
    expect(relsOf(closed, 'a').has('friend:b')).toBe(true)
  })

  // relsOf + ppl are scoped to the closedLinks describe; mirror the tiny ones we need.
  function relsOf(closed: ContactLink[], id: string): Set<string> {
    const key = k(id)
    const out = new Set<string>()
    for (const l of closed) {
      const a = personKey(l.personAKind, l.personAId)
      const b = personKey(l.personBKind, l.personBId)
      if (a === key) out.add(`${l.type}:${parsePersonKey(b).id}`)
      else if (b === key) out.add(`${l.reverseType}:${parsePersonKey(a).id}`)
    }
    return out
  }
  const ppl = (...ids: string[]) => buildPeople(ids.map((id) => contact(id, id)), [])
})

describe('proposeFamilyLinks (« Compléter les familles »)', () => {
  const k = (id: string) => personKey('contact', id)
  const ppl = (...ids: string[]) => buildPeople(ids.map((id) => contact(id, id)), [])
  const famGroup = (id: string, ...ids: string[]) => ({
    id,
    name: id,
    kind: 'family' as const,
    colour: null,
    memberKeys: new Set(ids.map(k)),
  })

  it('materializes the precise rung the hierarchy already implies (siblings via shared parent)', () => {
    // p is parent of x AND y → closure knows x & y are siblings, but no link stores it.
    const props = proposeFamilyLinks(ppl('p', 'x', 'y'), [link('p', 'x', 'parent'), link('p', 'y', 'parent')], [famGroup('g', 'p', 'x', 'y')])
    expect(props).toHaveLength(1) // p-x and p-y already stored; only x-y is missing
    expect(props[0]).toMatchObject({ op: 'create', type: 'sibling', inferred: true })
    expect([props[0].aKey, props[0].bKey].sort()).toEqual([k('x'), k('y')])
  })

  it('falls back to a generic relative tie when no rung can be known', () => {
    const props = proposeFamilyLinks(ppl('a', 'b', 'c'), [], [famGroup('g', 'a', 'b', 'c')])
    expect(props).toHaveLength(3) // a-b, a-c, b-c
    expect(props.every((p) => p.op === 'create' && p.type === 'relative' && !p.inferred)).toBe(true)
  })

  it('leaves a pair with an explicit tie of another type alone (explicit wins)', () => {
    expect(proposeFamilyLinks(ppl('a', 'b'), [link('a', 'b', 'friend')], [famGroup('g', 'a', 'b')])).toHaveLength(0)
  })

  it('upgrades a vague stored relative to the precise rung the hierarchy now reveals', () => {
    const links = [link('p', 'x', 'parent'), link('p', 'y', 'parent'), link('x', 'y', 'relative')]
    const props = proposeFamilyLinks(ppl('p', 'x', 'y'), links, [famGroup('g', 'p', 'x', 'y')])
    expect(props).toHaveLength(1)
    expect(props[0]).toMatchObject({ op: 'modify', type: 'sibling', inferred: true, existingId: 'x-y' })
  })

  it('ignores non-family-kind groups', () => {
    const friends = { id: 'g', name: 'g', kind: 'friends' as const, colour: null, memberKeys: new Set([k('a'), k('b')]) }
    expect(proposeFamilyLinks(ppl('a', 'b'), [], [friends])).toHaveLength(0)
  })
})

describe('proposeAllFamilyLinks (one button: group completion + transitive bridges)', () => {
  const k = (id: string) => personKey('contact', id)
  const ppl = (...ids: string[]) => buildPeople(ids.map((id) => contact(id, id)), [])
  const famGroup = (id: string, ...ids: string[]) => ({
    id, name: id, kind: 'family' as const, colour: null, memberKeys: new Set(ids.map(k)),
  })
  const tie = (props: { aKey: string; bKey: string; type: string }[], x: string, y: string) =>
    props.find((p) => [p.aKey, p.bKey].sort().join() === [k(x), k(y)].sort().join())?.type

  it('surfaces a transitive bridge with NO group built (shared parent → sibling) + carries a reason', () => {
    // p is parent of x AND y, no named group → group completion alone proposes nothing,
    // but the deduction still connects x & y as siblings — the "do a few links" case.
    const props = proposeAllFamilyLinks(ppl('p', 'x', 'y'), [link('p', 'x', 'parent'), link('p', 'y', 'parent')], [])
    expect(props).toHaveLength(1)
    expect(props[0]).toMatchObject({ op: 'create', type: 'sibling' })
    expect([props[0].aKey, props[0].bKey].sort()).toEqual([k('x'), k('y')])
    expect(props[0].reason).toBeDefined() // a transitive item carries its own "why"
  })

  it('deduces spouse from co-parents (links two families through one junction)', () => {
    const props = proposeAllFamilyLinks(ppl('a', 'b', 'c'), [link('a', 'c', 'parent'), link('b', 'c', 'parent')], [])
    expect(tie(props, 'a', 'b')).toBe('spouse')
  })

  it("deduces an in-law rung from a spouse's parent, oriented correctly", () => {
    // a is spouse of b; d is b's parent → d is a's parent-in-law, so (oriented a < d) a is
    // d's CHILD-in-law (belle-fille / beau-fils). The rung must not read backwards.
    const props = proposeAllFamilyLinks(ppl('a', 'b', 'd'), [link('a', 'b', 'spouse'), link('d', 'b', 'parent')], [])
    const p = props.find((pp) => [pp.aKey, pp.bKey].sort().join() === [k('a'), k('d')].sort().join())
    expect(p).toMatchObject({ op: 'create', aKey: k('a'), bKey: k('d'), type: 'child_in_law' })
  })

  it("deduces a sibling-in-law from a spouse's sibling", () => {
    // a is spouse of b; b is sibling of c → c is a's sibling-in-law (belle-sœur / beau-frère).
    const props = proposeAllFamilyLinks(ppl('a', 'b', 'c'), [link('a', 'b', 'spouse'), link('b', 'c', 'sibling')], [])
    expect(tie(props, 'a', 'c')).toBe('sibling_in_law')
  })

  it("deduces a sibling-in-law from a sibling's spouse", () => {
    // a is sibling of b; b is spouse of c → c is a's sibling-in-law.
    const props = proposeAllFamilyLinks(ppl('a', 'b', 'c'), [link('a', 'b', 'sibling'), link('b', 'c', 'spouse')], [])
    expect(tie(props, 'a', 'c')).toBe('sibling_in_law')
  })

  it('upgrades a stored generic « Belle-famille » to the precise in-law rung', () => {
    // a spouse b; d is b's parent; a & d ALREADY linked generically as in_law → the completer
    // offers a MODIFY that lifts « Belle-famille » to the specific rung (a is d's child-in-law).
    const props = proposeAllFamilyLinks(
      ppl('a', 'b', 'd'),
      [link('a', 'b', 'spouse'), link('d', 'b', 'parent'), link('a', 'd', 'in_law')],
      [],
    )
    const p = props.find((pp) => [pp.aKey, pp.bKey].sort().join() === [k('a'), k('d')].sort().join())
    expect(p).toMatchObject({ op: 'modify', existingId: 'a-d', type: 'child_in_law' })
  })

  it('leaves a stored generic « Belle-famille » alone when no precise rung is derivable', () => {
    // a & b are in_law with nothing else connecting them → no specific rung to infer, no upgrade.
    const props = proposeAllFamilyLinks(ppl('a', 'b'), [link('a', 'b', 'in_law')], [])
    expect(props).toHaveLength(0)
  })

  it('dedups: a pair the group already completes is not also added as a transitive guess', () => {
    const links = [link('p', 'x', 'parent'), link('p', 'y', 'parent')]
    const props = proposeAllFamilyLinks(ppl('p', 'x', 'y'), links, [famGroup('g', 'p', 'x', 'y')])
    const xy = props.filter((pp) => [pp.aKey, pp.bKey].sort().join() === [k('x'), k('y')].sort().join())
    expect(xy).toHaveLength(1)
  })

  it('completes a precise tie across the whole web with NO named group (grandparent span)', () => {
    // gp → pa → ch: the closure knows gp is ch's grandparent, but the old per-group
    // completer proposed nothing without a named group (and none of the three inferLinks
    // bridges cover it). The web pass materializes it. Ids sort gp < pa < ch so the tie
    // orients gp→ch = grandparent.
    const props = proposeAllFamilyLinks(
      ppl('a_gp', 'b_pa', 'c_ch'),
      [link('a_gp', 'b_pa', 'parent'), link('b_pa', 'c_ch', 'parent')],
      [],
    )
    expect(tie(props, 'a_gp', 'c_ch')).toBe('grandparent')
  })

  it('completes cousins across a shared-grandparent web with NO named group', () => {
    // s1 & s2 are siblings; each has a child → the children are cousins. No named group
    // and none of the three inferLinks bridges surface this — only the web completion does.
    const props = proposeAllFamilyLinks(
      ppl('s1', 's2', 'c1', 'c2'),
      [link('s1', 's2', 'sibling'), link('s1', 'c1', 'parent'), link('s2', 'c2', 'parent')],
      [],
    )
    expect(tie(props, 'c1', 'c2')).toBe('cousin')
  })

  it("bridges a conjoint·e's niece onto you (spouse's DERIVED aunt/uncle crosses the marriage)", () => {
    // marc is spouse of camille; camille is a sibling of aliss's parent → camille is
    // aliss's aunt (DERIVED, not stored). The blood-only closure never crosses the
    // marriage, so the by-marriage bridge is the only pass that links marc ↔ aliss.
    const props = proposeAllFamilyLinks(
      ppl('marc', 'camille', 'par', 'aliss'),
      [link('marc', 'camille', 'spouse'), link('camille', 'par', 'sibling'), link('par', 'aliss', 'parent')],
      [],
    )
    // aunt/uncle ↔ niece/nephew is one rung; orientation follows the id sort.
    expect(['aunt_uncle', 'niece_nephew']).toContain(tie(props, 'marc', 'aliss'))
    const p = props.find((pp) => [pp.aKey, pp.bKey].sort().join() === [k('marc'), k('aliss')].sort().join())
    expect(p?.reason).toBeDefined() // carries the "spouse's family" why
  })

  it('leaves an explicit stored tie alone rather than re-proposing a by-marriage rung', () => {
    // Same shape, but marc↔aliss is ALREADY an explicit friend tie — the bridge must not
    // override it (proposePair's "an explicit tie always wins").
    const props = proposeAllFamilyLinks(
      ppl('marc', 'camille', 'par', 'aliss'),
      [
        link('marc', 'camille', 'spouse'),
        link('camille', 'par', 'sibling'),
        link('par', 'aliss', 'parent'),
        link('marc', 'aliss', 'friend'),
      ],
      [],
    )
    expect(tie(props, 'marc', 'aliss')).toBeUndefined()
  })
})

// ---- Pet ownership + household-family reach (the « Famille vs Social » rule) -----

const pet = (id: string, name: string): Pet => ({
  id,
  name,
  species: null,
  breed: null,
  photoKey: null,
  colour: null,
  birthday: null,
  microchip: null,
  feeding: null,
  sitterNotes: null,
  vetBusinessId: null,
  weights: [],
  notes: null,
})
// A typed link with explicit kinds on either endpoint (the `link` helper above is
// contact/member only; pets need 'pet').
const klink = (aId: string, aKind: PersonKind, bId: string, bKind: PersonKind, type: RelationshipType): ContactLink => ({
  id: `${aId}-${bId}`,
  personAId: aId,
  personAKind: aKind,
  personBId: bId,
  personBKind: bKind,
  type,
  reverseType: RELATIONSHIP_INVERSES[type],
  label: null,
  notes: null,
})

describe('petOwners', () => {
  it('maps a pet to its owner, in either stored direction', () => {
    const fwd = petOwners([klink('m1', 'member', 'p1', 'pet', 'owner')])
    expect(fwd.get('pet:p1')).toEqual(new Set(['member:m1']))
    // mirror: "pet is pet of owner"
    const rev = petOwners([klink('p1', 'pet', 'm1', 'member', 'pet')])
    expect(rev.get('pet:p1')).toEqual(new Set(['member:m1']))
  })
  it('collects multiple owners and ignores non-owner links', () => {
    const m = petOwners([
      klink('m1', 'member', 'p1', 'pet', 'owner'),
      klink('c9', 'contact', 'p1', 'pet', 'owner'),
      link('a', 'b', 'friend'),
    ])
    expect(m.get('pet:p1')).toEqual(new Set(['member:m1', 'contact:c9']))
  })
})

describe('isHouseholdPet', () => {
  const memberKeys = new Set(['member:m1'])
  it('an unowned pet defaults to the Maisonnée', () => {
    expect(isHouseholdPet('pet:p1', petOwners([]), memberKeys)).toBe(true)
  })
  it('a member-owned pet is ours', () => {
    const owners = petOwners([klink('m1', 'member', 'p1', 'pet', 'owner')])
    expect(isHouseholdPet('pet:p1', owners, memberKeys)).toBe(true)
  })
  it("a friend-only-owned pet is NOT ours", () => {
    const owners = petOwners([klink('c9', 'contact', 'p1', 'pet', 'owner')])
    expect(isHouseholdPet('pet:p1', owners, memberKeys)).toBe(false)
  })
  it('co-owned by a member + a friend is still ours', () => {
    const owners = petOwners([
      klink('m1', 'member', 'p1', 'pet', 'owner'),
      klink('c9', 'contact', 'p1', 'pet', 'owner'),
    ])
    expect(isHouseholdPet('pet:p1', owners, memberKeys)).toBe(true)
  })
})

describe('familyReachableKeys (Famille = family-reachable from the household)', () => {
  // Cast of characters:
  //   m1 = household member (the seed)
  //   c1 = m1's parent (family edge) → reachable (your extended family)
  //   p1 = m1's pet (owner edge, a family rel) → reachable
  //   f1 = m1's FRIEND (social edge) → NOT reachable
  //   f1k = f1's kid (f1 is parent of f1k) → NOT reachable (only via the social bridge)
  //   fp = f1's pet → NOT reachable
  const members = [member('m1', 'Moi')]
  const contacts = [contact('c1', 'Maman'), contact('f1', 'Ami'), contact('f1k', 'Petit')]
  const pets = [pet('p1', 'Rex'), pet('fp', 'Minou')]
  const people = buildPeople(contacts, members, pets)
  const links = [
    klink('c1', 'contact', 'm1', 'member', 'parent'), // Maman is parent of Moi
    klink('m1', 'member', 'p1', 'pet', 'owner'), // Moi owns Rex
    klink('m1', 'member', 'f1', 'contact', 'friend'), // Moi ↔ Ami (social bridge)
    klink('f1', 'contact', 'f1k', 'contact', 'parent'), // Ami is parent of his kid
    klink('f1', 'contact', 'fp', 'pet', 'owner'), // Ami owns his pet
  ]

  const reach = familyReachableKeys(new Set(['member:m1']), people, links)

  it('includes the seed, your family and your pet', () => {
    expect(reach.has('member:m1')).toBe(true)
    expect(reach.has('contact:c1')).toBe(true)
    expect(reach.has('pet:p1')).toBe(true)
  })
  it('excludes a friend, the friend’s kid and the friend’s pet (social bridge not crossed)', () => {
    expect(reach.has('contact:f1')).toBe(false)
    expect(reach.has('contact:f1k')).toBe(false)
    expect(reach.has('pet:fp')).toBe(false)
  })
})

// ---- « Notre monde » — the big-picture overview (islands + bridges) ---------

describe('buildWorld', () => {
  const ppl = buildPeople([contact('c1', 'A'), contact('c2', 'B'), contact('c3', 'C')], [member('m1', 'M')])
  const mk = personKey('member', 'm1')
  const c1 = personKey('contact', 'c1')
  const c2 = personKey('contact', 'c2')
  const c3 = personKey('contact', 'c3')
  // household {m1,c1}; friends group {c1,c2}; c3 is in nothing.
  const clusters = [
    { id: 'household', name: 'Maison', kind: 'household' as const, colour: '#000', memberKeys: [mk, c1] },
    { id: 'group:amis', name: 'Amis', kind: 'group' as const, groupKind: 'friends' as const, colour: null, memberKeys: [c1, c2] },
  ]
  const links = [klink('c2', 'contact', 'c3', 'contact', 'friend')]
  const world = buildWorld(ppl, links, clusters, 'Autres')
  const island = (id: string) => world.islands.find((i) => i.id === id)
  const pair = (a: string, b: string) => [a, b].sort().join('|')
  const bridge = (a: string, b: string) => world.bridges.find((x) => pair(x.aId, x.bId) === pair(a, b))

  it('assigns each person to their highest-priority island', () => {
    expect([...island('household')!.memberKeys].sort()).toEqual([mk, c1].sort())
    expect(island('group:amis')!.memberKeys).toEqual([c2]) // c1 was claimed by household
  })
  it('collects unaffiliated people into an « Autres » island', () => {
    const others = world.islands.find((i) => i.kind === 'others')!
    expect(others.memberKeys).toEqual([c3])
    expect(others.name).toBe('Autres')
  })
  it('bridges two islands by a SHARED member (c1 in household + amis)', () => {
    const b = bridge('household', 'group:amis')
    expect(b).toBeTruthy()
    expect(b!.viaKeys).toContain(c1)
  })
  it('bridges two islands by a CROSS-island link (c2 ↔ c3)', () => {
    expect(bridge('group:amis', '__others__')).toBeTruthy()
  })
  it('drops an island whose members are all claimed by a higher priority', () => {
    const c2only = [
      { id: 'household', name: 'M', kind: 'household' as const, colour: null, memberKeys: [c1] },
      { id: 'group:solo', name: 'Solo', kind: 'group' as const, colour: null, memberKeys: [c1] },
    ]
    expect(buildWorld(ppl, [], c2only, 'Autres').islands.find((i) => i.id === 'group:solo')).toBeUndefined()
  })
})

describe('worldClustersFrom', () => {
  it('orders clusters household → family → social, detecting auto-families', () => {
    const members = [member('m1', 'Moi')]
    const contacts = [contact('a', 'Ana'), contact('b', 'Bo'), contact('f', 'Fred')]
    const people = buildPeople(contacts, members)
    const links = closedLinks(people, [klink('a', 'contact', 'b', 'contact', 'sibling')]) // a,b auto-family
    const groups = [{ id: 'amis', name: 'Amis', kind: 'friends' as const, colour: null, memberKeys: new Set([personKey('contact', 'f')]) }]
    const householdKeys = new Set([personKey('member', 'm1')])
    const clusters = worldClustersFrom(people, links, groups, householdKeys, 'Maison', '#000', (n) => (n ? `Famille ${n}` : 'Famille'))
    expect(clusters[0].kind).toBe('household')
    expect(clusters.some((c) => c.kind === 'family')).toBe(true) // the a/b auto-family
    const social = clusters.find((c) => c.kind === 'group')
    expect(social?.groupKind).toBe('friends')
    // social comes after the family in priority order
    expect(clusters.findIndex((c) => c.kind === 'group')).toBeGreaterThan(clusters.findIndex((c) => c.kind === 'family'))
  })
})

// ---- Graph geometry ---------------------------------------------------------
// These pin the bug that made Social ▸ Liens unreadable: a ring whose radius came from
// a constant cap, so N faces were dealt onto a circle with room for far fewer.

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const minSpacing = (pts: { x: number; y: number }[]) => {
  let m = Infinity
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, dist(pts[i], pts[j]))
  return m
}

describe('islandFaceLayout', () => {
  const SLOT = 60

  it('never lets two faces on an island overlap, at any size', () => {
    // 2..40 people. The regression: 18 faces used to land on a radius-84 ring.
    for (let n = 2; n <= 40; n++) {
      const { offsets } = islandFaceLayout(n, SLOT)
      expect(offsets).toHaveLength(n)
      expect(minSpacing(offsets), `${n} faces sit closer than one slot apart`).toBeGreaterThanOrEqual(SLOT * 0.99)
    }
  })

  it('grows the ring with the count instead of capping it', () => {
    const r6 = islandFaceLayout(6, SLOT).r
    const r18 = islandFaceLayout(18, SLOT).r
    const r30 = islandFaceLayout(30, SLOT).r
    expect(r18).toBeGreaterThan(r6)
    expect(r30).toBeGreaterThan(r18)
  })

  it('keeps the inner ring a full slot inside the outer one', () => {
    const { offsets, r } = islandFaceLayout(9, SLOT) // 6 outer + 3 inner
    const inner = Math.min(...offsets.map((o) => Math.hypot(o.x, o.y)))
    expect(r - inner).toBeGreaterThanOrEqual(SLOT * 1.04)
  })

  it('centres a lone face', () => {
    expect(islandFaceLayout(1, SLOT).offsets).toEqual([{ x: 0, y: 0 }])
  })
})

describe('layoutIslands', () => {
  const ppl = buildPeople([contact('a', 'Ana'), contact('b', 'Bo'), contact('c', 'Cy')], [member('m1', 'Moi')])
  const byKey = new Map(ppl.map((p) => [p.key, p]))
  const mk = personKey('member', 'm1')
  const ca = personKey('contact', 'a')
  const cb = personKey('contact', 'b')
  const cc = personKey('contact', 'c')
  const OPTS = { face: 50, pad: 20, gap: 70, labelH: 30 }
  const mid = (p: { cx: number; cy: number }) => ({ x: p.cx, y: p.cy })

  it('centres the household and orbits the rest around it', () => {
    const world = buildWorld(
      ppl,
      [],
      [
        { id: 'household', name: 'Maison', kind: 'household' as const, colour: null, memberKeys: [mk] },
        { id: 'g1', name: 'Amis', kind: 'group' as const, colour: null, memberKeys: [ca, cb] },
      ],
      'Autres',
    )
    const l = layoutIslands(world, byKey, OPTS)!
    const house = l.placed.find((p) => p.island.kind === 'household')!
    const amis = l.placed.find((p) => p.island.id === 'g1')!
    expect(l.placed.some((p) => p.island.kind === 'others')).toBe(true) // c is unaffiliated
    expect(dist(mid(house), mid(amis))).toBeGreaterThan(house.outerR)
    expect(amis.faces).toHaveLength(2)
  })

  it('centres a lone circle rather than orbiting nothing (Social has no household)', () => {
    const world = buildWorld(ppl, [], [{ id: 'g1', name: 'Amis', kind: 'group' as const, colour: null, memberKeys: [mk, ca, cb, cc] }], 'Autres')
    const l = layoutIslands(world, byKey, OPTS)!
    expect(l.placed).toHaveLength(1)
    expect(l.placed[0].cx).toBeCloseTo(l.width / 2, 0)
  })

  it('keeps two islands from overlapping, and every face inside its halo', () => {
    const world = buildWorld(
      ppl,
      [],
      [
        { id: 'g1', name: 'Un', kind: 'group' as const, colour: null, memberKeys: [mk, ca] },
        { id: 'g2', name: 'Deux', kind: 'group' as const, colour: null, memberKeys: [cb, cc] },
      ],
      'Autres',
    )
    const l = layoutIslands(world, byKey, OPTS)!
    const [a, b] = l.placed
    expect(dist(mid(a), mid(b))).toBeGreaterThanOrEqual(a.outerR + b.outerR)
    for (const isl of l.placed) for (const f of isl.faces) expect(Math.hypot(f.x, f.y) + OPTS.face / 2).toBeLessThanOrEqual(isl.outerR + 0.01)
  })

  it('emits a positive-coordinate box that contains every island', () => {
    const world = buildWorld(ppl, [], [{ id: 'g1', name: 'Amis', kind: 'group' as const, colour: null, memberKeys: [ca, cb] }], 'Autres')
    const l = layoutIslands(world, byKey, OPTS)!
    for (const isl of l.placed) {
      expect(isl.cx - isl.outerR).toBeGreaterThanOrEqual(0)
      expect(isl.cy - isl.outerR).toBeGreaterThanOrEqual(0)
      expect(isl.cx + isl.outerR).toBeLessThanOrEqual(l.width)
      expect(isl.cy + isl.outerR).toBeLessThanOrEqual(l.height)
    }
  })

  it('returns null for an empty world', () => {
    expect(layoutIslands({ islands: [], bridges: [] }, byKey, OPTS)).toBeNull()
  })
})

describe('layoutFamilyForest', () => {
  const OPTS = { rowH: 100, colW: 100, compGap: 50 }
  const yOf = (l: NonNullable<ReturnType<typeof layoutFamilyForest>>, key: string) => l.nodes.find((n) => n.p.key === key)!.y

  // Two families, each parent→child; the two parents are friends, and one of them is
  // also friends with someone who has no family of their own.
  const contacts = [contact('p1', 'Pa', 'Un'), contact('k1', 'Kid', 'Un'), contact('p2', 'Pb', 'Deux'), contact('k2', 'Kidb', 'Deux'), contact('lone', 'Solo')]
  const people = buildPeople(contacts, [])
  const K = (id: string) => personKey('contact', id)
  const family = [klink('p1', 'contact', 'k1', 'contact', 'parent'), klink('p2', 'contact', 'k2', 'contact', 'parent')]
  const friendship = [klink('p1', 'contact', 'p2', 'contact', 'friend'), klink('p1', 'contact', 'lone', 'contact', 'friend')]

  it('stack: keeps Famille’s behaviour — blood only, trees under one another', () => {
    const l = layoutFamilyForest(people, [...family, ...friendship], { ...OPTS, flow: 'stack', compMinW: 600 })!
    expect(l.nodes.map((n) => n.p.key).sort()).toEqual([K('p1'), K('k1'), K('p2'), K('k2')].sort()) // `lone` has no family → dropped
    expect(l.socialEdges).toHaveLength(0)
    expect(l.frames).toHaveLength(0)
    expect(l.seps).toHaveLength(1) // one divider between the two stacked trees
    expect(l.familyEdges).toHaveLength(2)
    // The two trees never share bands: family Deux sits entirely below family Un.
    expect(yOf(l, K('p2'))).toBeGreaterThan(yOf(l, K('k1')))
  })

  it('row: draws the friendships between families and keeps blood ties separate', () => {
    const l = layoutFamilyForest(people, [...family, ...friendship], { ...OPTS, flow: 'row', socialTies: true, includeIsolated: true })!
    expect(l.familyEdges).toHaveLength(2)
    expect(l.socialEdges).toHaveLength(2) // p1↔p2 and p1↔lone
    expect(l.nodes).toHaveLength(5) // the lone friend is a tree of one, not dropped
  })

  it('row: a friendship between two parents puts their families on the same band', () => {
    const l = layoutFamilyForest(people, [...family, ...friendship], { ...OPTS, flow: 'row', socialTies: true, includeIsolated: true })!
    expect(yOf(l, K('p1'))).toBe(yOf(l, K('p2'))) // the friendship reads as a level line
    expect(yOf(l, K('k1'))).toBe(yOf(l, K('k2')))
    expect(yOf(l, K('k1'))).toBeGreaterThan(yOf(l, K('p1'))) // children still below parents
    expect(yOf(l, K('lone'))).toBe(yOf(l, K('p1'))) // the lone friend aligns on his friend
  })

  it('row: aligns a cross-generation friendship on the friends themselves', () => {
    // p1 (a parent) is friends with k2 (the other family's CHILD) → those two align,
    // which lifts family Deux one band up.
    const cross = [klink('p1', 'contact', 'k2', 'contact', 'friend')]
    const l = layoutFamilyForest(people, [...family, ...cross], { ...OPTS, flow: 'row', socialTies: true, includeIsolated: true })!
    expect(yOf(l, K('p1'))).toBe(yOf(l, K('k2')))
    expect(yOf(l, K('p2'))).toBeLessThan(yOf(l, K('p1')))
  })

  it('row: frames and names each family, never a lone friend', () => {
    const names = new Map([
      [K('p1'), { name: 'Famille Un', colour: '#111' }],
      [K('k1'), { name: 'Famille Un', colour: '#111' }],
      [K('p2'), { name: 'Famille Deux', colour: null }],
      [K('k2'), { name: 'Famille Deux', colour: null }],
      [K('lone'), { name: 'Le hockey', colour: null }],
    ])
    const l = layoutFamilyForest(people, [...family, ...friendship], {
      ...OPTS,
      flow: 'row',
      socialTies: true,
      includeIsolated: true,
      framePadX: 10,
      framePadY: 40,
      clusterOf: (k) => names.get(k) ?? null,
    })!
    expect(l.frames.map((f) => f.name).sort()).toEqual(['Famille Deux', 'Famille Un'])
    expect(l.frames.find((f) => f.name === 'Famille Un')!.colour).toBe('#111')
    // Every framed family's faces sit inside its own frame, and nobody else's.
    for (const f of l.frames) {
      const inside = l.nodes.filter((n) => n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h)
      expect(inside).toHaveLength(f.count)
    }
    // Two frames never overlap.
    const [a, b] = l.frames
    expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
  })

  it('ignores a friendship inside one family — it adds nothing to read', () => {
    const inFamily = [klink('p1', 'contact', 'k1', 'contact', 'friend')]
    const l = layoutFamilyForest(people, [...family, ...inFamily], { ...OPTS, flow: 'row', socialTies: true, includeIsolated: true })!
    expect(l.socialEdges).toHaveLength(0)
  })

  it('returns null when there is nobody to place', () => {
    expect(layoutFamilyForest([], [], { ...OPTS, flow: 'stack' })).toBeNull()
    expect(layoutFamilyForest(buildPeople([contact('x', 'X')], []), [], { ...OPTS, flow: 'stack' })).toBeNull() // no family link
  })
})

// The Worker can't import the SPA's copy, so functions/_lib/birthdays.ts keeps a
// duplicate `parseBirthday`. Same pin as the INVERSES check above, and written for a
// real drift found 2026-08-28: the server copy matched `\d{4}` where this one — and
// BOTH write validators — matched `\d{1,4}`, so a stored 1–3-digit year rendered on
// the cercle page and was silently dropped from the board's agenda, which derives its
// birthdays server-side. A file-text mirror won't do (the two have always differed in
// signature and wording), so this compares BEHAVIOUR, which is what matters.
import { parseBirthday as parseServer } from '../../functions/_lib/birthdayRule'

describe('parseBirthday — the client and server copies agree', () => {
  const CASES: (string | null | undefined)[] = [
    '2020-06-24', // the ordinary case
    '0000-03-12', // year unknown
    '1-03-12', // ← the divergence: a 1-digit year
    '99-03-12', // 2-digit
    '999-01-01', // 3-digit
    '2024-02-29', // leap day
    '  2020-06-24  ', // both trim
    '2020-13-01', // month out of range → null on both
    '2020-00-01', // month 0
    '2020-06-32', // day out of range
    '2020-06-00', // day 0
    '20200624', // no separators
    '2020-6-4', // unpadded month/day → null on both
    '2020-06-24T00:00:00Z', // a datetime is not a birthday
    'not-a-date',
    '',
    null,
    undefined,
  ]

  for (const input of CASES) {
    it(`agrees on ${JSON.stringify(input)}`, () => {
      expect(parseServer(input)).toEqual(parseBirthday(input))
    })
  }

  it('both read a short year rather than dropping it', () => {
    // Both write validators accept `\d{1,4}`, so this CAN already be in the table.
    expect(parseBirthday('1-03-12')).toEqual({ year: 1, month: 3, day: 12, yearKnown: true })
    expect(parseServer('1-03-12')).toEqual(parseBirthday('1-03-12'))
  })
})
