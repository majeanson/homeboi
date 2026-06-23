import { describe, it, expect } from 'vitest'
import { matchIntakePerson, decodeIntakeScope, encodeIntakeScope, INTAKE_FIELDS_ALL, type IntakePersonInput } from './intake'
import type { Contact, Member } from './cercle'

describe('intake field scope', () => {
  it('absent bitmask means ask everything', () => {
    expect(decodeIntakeScope(null)).toEqual({ bday: true, contact: true, addr: true, household: true })
    expect(decodeIntakeScope(undefined)).toEqual({ bday: true, contact: true, addr: true, household: true })
    expect(INTAKE_FIELDS_ALL).toBe(15)
  })

  it('round-trips through encode → decode', () => {
    const scope = { bday: true, contact: false, addr: false, household: true }
    expect(decodeIntakeScope(encodeIntakeScope(scope))).toEqual(scope)
  })

  it('encodes a known combination', () => {
    expect(encodeIntakeScope({ bday: true, contact: true, addr: false, household: false })).toBe(3)
  })
})

// Dedupe matcher: an incoming intake card should fold into an existing person when
// it clearly IS them (email / phone / name), so an open link never duplicates.

const person = (p: Partial<IntakePersonInput>): IntakePersonInput => ({
  firstName: '',
  lastName: '',
  nickname: '',
  birthday: null,
  gender: null,
  email: '',
  phone: '',
  address: null,
  notes: '',
  ...p,
})

const contact = (p: Partial<Contact>): Contact =>
  ({ id: 'c', firstName: '', lastName: '', email: null, phone: null, memberId: null, ...p }) as Contact

const member = (p: Partial<Member>): Member => ({ id: 'm', displayName: '', ...p }) as Member

describe('matchIntakePerson', () => {
  const contacts = [
    contact({ id: 'c1', firstName: 'Marie', lastName: 'Roy', email: 'marie@x.ca', phone: '514-555-0123' }),
    contact({ id: 'c2', firstName: 'Paul', lastName: 'Roy' }),
  ]
  const members = [member({ id: 'm1', displayName: 'Camille' })]

  it('matches on email first', () => {
    const m = matchIntakePerson(person({ firstName: 'M', email: 'MARIE@x.ca' }), contacts, members)
    expect(m).toEqual({ kind: 'contact', id: 'c1', name: 'Marie Roy' })
  })

  it('matches on phone (digits only)', () => {
    const m = matchIntakePerson(person({ firstName: 'X', phone: '(514) 555 0123' }), contacts, members)
    expect(m?.id).toBe('c1')
  })

  it('matches on full name when no email/phone', () => {
    const m = matchIntakePerson(person({ firstName: 'paul', lastName: 'ROY' }), contacts, members)
    expect(m).toEqual({ kind: 'contact', id: 'c2', name: 'Paul Roy' })
  })

  it('matches a Maisonnée member by name', () => {
    const m = matchIntakePerson(person({ firstName: 'Camille' }), contacts, members)
    expect(m).toEqual({ kind: 'member', id: 'm1', name: 'Camille' })
  })

  it('returns null when nobody matches', () => {
    expect(matchIntakePerson(person({ firstName: 'Zoé', lastName: 'Inconnue' }), contacts, members)).toBeNull()
  })
})
