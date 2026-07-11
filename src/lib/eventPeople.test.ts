import { describe, it, expect } from 'vitest'
import { parsePeopleIds, eventMembers, memberFaces } from './eventPeople'
import type { Member } from './members'

describe('parsePeopleIds', () => {
  it('parses a JSON id array', () => {
    expect(parsePeopleIds('["m1","m2"]')).toEqual(['m1', 'm2'])
  })
  it('reads absent/empty/garbage as no people (never throws)', () => {
    expect(parsePeopleIds(null)).toEqual([])
    expect(parsePeopleIds(undefined)).toEqual([])
    expect(parsePeopleIds('')).toEqual([])
    expect(parsePeopleIds('not json')).toEqual([])
    expect(parsePeopleIds('{"a":1}')).toEqual([]) // an object, not an array
  })
  it('drops non-string entries', () => {
    expect(parsePeopleIds('["m1",2,null,"m2"]')).toEqual(['m1', 'm2'])
  })
})

describe('eventMembers', () => {
  it('uses the passengers set when present', () => {
    expect(eventMembers({ member_id: 'm1', passengers: '["m1","m2","m3"]' })).toEqual(['m1', 'm2', 'm3'])
  })
  it('falls back to the legacy single member_id for pre-multi rows', () => {
    expect(eventMembers({ member_id: 'm7', passengers: null })).toEqual(['m7'])
    expect(eventMembers({ member_id: 'm7' })).toEqual(['m7'])
  })
  it('is empty when neither is set (an external-only « Avec » rendez-vous)', () => {
    expect(eventMembers({ member_id: null, passengers: null })).toEqual([])
    expect(eventMembers({ member_id: null, passengers: '[]' })).toEqual([])
  })
})

describe('memberFaces', () => {
  const roster: Member[] = [
    { id: 'm1', display_name: 'Papa', colour: '#c33', is_child: 0, avatar_kind: 'photo', avatar_ref: 'k1' },
    { id: 'm2', display_name: 'Léa', colour: '#3c3', is_child: 1 },
  ] as unknown as Member[]
  it('resolves ids to faces in order, dropping unknown ids (a deleted member)', () => {
    expect(memberFaces(['m2', 'ghost', 'm1'], roster)).toEqual([
      { kind: undefined, photo: undefined, colour: '#3c3', name: 'Léa' },
      { kind: 'photo', photo: 'k1', colour: '#c33', name: 'Papa' },
    ])
  })
})
