import { describe, it, expect } from 'vitest'
import { familyToShare, type FamilyShareData } from './cercleShare'
import { personKey, type Contact, type Member, type Pet, type ContactLink, type RelationshipType } from './cercle'

// ---- Minimal fixtures --------------------------------------------------------

const member = (id: string, displayName: string, over: Partial<Member> = {}): Member => ({
  id,
  displayName,
  avatarKind: 'color',
  avatarRef: '#123456',
  colour: '#123456',
  isChild: false,
  email: null,
  phone: null,
  birthday: null,
  notes: null,
  gender: null,
  ...over,
})

const contact = (id: string, firstName: string, over: Partial<Contact> = {}): Contact => ({
  id,
  firstName,
  lastName: '',
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
  ...over,
})

const pet = (id: string, name: string, over: Partial<Pet> = {}): Pet => ({
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
  ...over,
})

const link = (
  aKind: 'contact' | 'member' | 'pet',
  aId: string,
  bKind: 'contact' | 'member' | 'pet',
  bId: string,
  type: RelationshipType,
  reverseType: RelationshipType,
): ContactLink => ({
  id: `${aId}-${bId}`,
  personAId: aId,
  personAKind: aKind,
  personBId: bId,
  personBKind: bKind,
  type,
  reverseType,
  label: null,
  notes: null,
})

describe('familyToShare', () => {
  it('materializes people, edges, and pets index-addressed', () => {
    const m = member('m1', 'Marc', { email: 'marc@x.ca', avatarKind: 'photo', avatarRef: 'av_1' })
    const c = contact('c1', 'Léa', { lastName: 'Tremblay', phone: '5551234' })
    const p = pet('p1', 'Rex', { species: 'Chien', photoKey: 'pt_1' })
    const data: FamilyShareData = {
      members: [m],
      contacts: [c],
      pets: [p],
      links: [
        link('member', 'm1', 'contact', 'c1', 'spouse', 'spouse'),
        link('member', 'm1', 'pet', 'p1', 'owner', 'pet'),
      ],
    }
    const out = familyToShare([personKey('member', 'm1'), personKey('contact', 'c1'), personKey('pet', 'p1')], data)!
    expect(out).not.toBeNull()
    // self = first human (Marc, index 0); a member's photo rides its avatarRef.
    expect(out.self.firstName).toBe('Marc')
    expect(out.self.email).toBe('marc@x.ca')
    expect(out.self.photoKey).toBe('av_1')
    // household = the rest (Léa, index 1).
    expect(out.household).toHaveLength(1)
    expect(out.household[0].firstName).toBe('Léa')
    expect(out.household[0].lastName).toBe('Tremblay')
    // The spouse edge maps to indices; owner/pet is NOT a person edge.
    expect(out.links).toEqual([{ aIndex: 0, bIndex: 1, type: 'spouse' }])
    // The pet rides along, owned by Marc (index 0).
    expect(out.pets).toEqual([{ name: 'Rex', species: 'Chien', photoKey: 'pt_1', ownerIndex: 0 }])
  })

  it('returns null when the family has no human to anchor', () => {
    const data: FamilyShareData = { members: [], contacts: [], pets: [pet('p1', 'Rex')], links: [] }
    expect(familyToShare([personKey('pet', 'p1')], data)).toBeNull()
  })

  it('drops edges to people outside the shared family and dedupes pairs', () => {
    const a = contact('a', 'A')
    const b = contact('b', 'B')
    const outsider = contact('z', 'Z')
    const data: FamilyShareData = {
      members: [],
      contacts: [a, b, outsider],
      pets: [],
      links: [
        link('contact', 'a', 'contact', 'b', 'sibling', 'sibling'),
        // A duplicate pair (reverse direction) — must collapse to one.
        link('contact', 'b', 'contact', 'a', 'sibling', 'sibling'),
        // An edge to someone not in the family — must be dropped.
        link('contact', 'a', 'contact', 'z', 'friend', 'friend'),
      ],
    }
    const out = familyToShare([personKey('contact', 'a'), personKey('contact', 'b')], data)!
    expect(out.household).toHaveLength(1) // b
    expect(out.links).toEqual([{ aIndex: 0, bIndex: 1, type: 'sibling' }])
  })

  it('falls back a pet owner to self when the owner is not shared', () => {
    const a = contact('a', 'A')
    const outsider = member('m9', 'Outsider')
    const p = pet('p1', 'Rex')
    const data: FamilyShareData = {
      members: [outsider],
      contacts: [a],
      pets: [p],
      // Rex is owned by the outsider, who isn't in the shared set.
      links: [link('member', 'm9', 'pet', 'p1', 'owner', 'pet')],
    }
    const out = familyToShare([personKey('contact', 'a'), personKey('pet', 'p1')], data)!
    expect(out.pets[0].ownerIndex).toBe(0)
  })
})
