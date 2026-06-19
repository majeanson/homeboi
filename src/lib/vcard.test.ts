import { describe, it, expect } from 'vitest'
import { toVCard } from './vcard'
import type { Contact } from './cercle'

const base: Contact = {
  id: 'c1',
  firstName: 'Léa',
  lastName: 'Tremblay',
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
}

describe('toVCard', () => {
  it('wraps in BEGIN/END and a 3.0 version, CRLF-terminated', () => {
    const v = toVCard(base)
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true)
    expect(v.trimEnd().endsWith('END:VCARD')).toBe(true)
    expect(v).toContain('\r\n')
  })

  it('emits N (Family;Given) and FN', () => {
    const v = toVCard(base)
    expect(v).toContain('N:Tremblay;Léa;;;')
    expect(v).toContain('FN:Léa Tremblay')
  })

  it('includes phone, email, a real birthday and tags when present', () => {
    const v = toVCard({ ...base, phone: '418-555-1234', email: 'lea@ex.ca', birthday: '1990-03-12', tags: ['amie', 'voisine'] })
    expect(v).toContain('TEL;TYPE=CELL:418-555-1234')
    expect(v).toContain('EMAIL;TYPE=INTERNET:lea@ex.ca')
    expect(v).toContain('BDAY:1990-03-12')
    expect(v).toContain('CATEGORIES:amie,voisine')
  })

  it('skips the 0000 "year unknown" birthday sentinel', () => {
    const v = toVCard({ ...base, birthday: '0000-03-12' })
    expect(v).not.toContain('BDAY')
  })

  it('escapes commas, semicolons and newlines in text values', () => {
    const v = toVCard({ ...base, notes: 'aime; les chats, et\nles chiens' })
    expect(v).toContain('NOTE:aime\\; les chats\\, et\\nles chiens')
  })

  it('emits a structured ADR from the address parts', () => {
    const v = toVCard({ ...base, address: { street: '123 rue Principale', city: 'Québec', state: 'QC', postalCode: 'G1A 1A1' } })
    expect(v).toContain('ADR;TYPE=HOME:;;123 rue Principale;Québec;QC;G1A 1A1;')
  })
})
