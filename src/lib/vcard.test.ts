import { describe, it, expect } from 'vitest'
import { toVCard, parseVCard } from './vcard'
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

describe('parseVCard (#44 import)', () => {
  it('round-trips a full contact through export → import', () => {
    const c: Contact = {
      ...base,
      firstName: 'Marie',
      lastName: 'Tremblay',
      nickname: 'Mimi',
      phone: '514-555-0143',
      email: 'marie@example.ca',
      birthday: '1985-07-02',
      address: { street: '12 rue des Érables', city: 'Québec', state: 'QC', postalCode: 'G1A 1A1' },
      notes: 'Allergique aux arachides; aime le thé.',
      tags: ['famille', 'marraine'],
    }
    const [p] = parseVCard(toVCard(c))
    expect(p.firstName).toBe('Marie')
    expect(p.lastName).toBe('Tremblay')
    expect(p.nickname).toBe('Mimi')
    expect(p.phone).toBe('514-555-0143')
    expect(p.email).toBe('marie@example.ca')
    expect(p.birthday).toBe('1985-07-02')
    expect(p.address).toEqual({ street: '12 rue des Érables', city: 'Québec', state: 'QC', postalCode: 'G1A 1A1' })
    expect(p.notes).toBe('Allergique aux arachides; aime le thé.')
    expect(p.tags).toEqual(['famille', 'marraine'])
  })

  it('preserves escaped punctuation/newlines in NOTE', () => {
    const [p] = parseVCard(toVCard({ ...base, notes: 'Ligne 1\nLigne 2; avec, ponctuation' }))
    expect(p.notes).toBe('Ligne 1\nLigne 2; avec, ponctuation')
  })

  it('parses MANY cards from one file (a phone export)', () => {
    const file =
      toVCard({ ...base, firstName: 'Ana', lastName: 'Roy' }) + toVCard({ ...base, firstName: 'Bo', lastName: 'Lee' })
    expect(parseVCard(file).map((p) => p.firstName)).toEqual(['Ana', 'Bo'])
  })

  it('falls back to FN when there is no structured N', () => {
    const [p] = parseVCard('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jean Untel\r\nEND:VCARD\r\n')
    expect(p.firstName).toBe('Jean')
    expect(p.lastName).toBe('Untel')
  })

  it('yields a null birthday when the export omitted the 0000 sentinel', () => {
    const [p] = parseVCard(toVCard({ ...base, birthday: '0000-03-14' }))
    expect(p.birthday).toBeNull()
  })

  it('takes the first TEL when several are present', () => {
    const card = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Roy;Ana;;;\r\nTEL;TYPE=CELL:111\r\nTEL;TYPE=HOME:222\r\nEND:VCARD\r\n'
    expect(parseVCard(card)[0].phone).toBe('111')
  })

  it('ignores blocks with no name', () => {
    expect(parseVCard('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n')).toEqual([])
  })
})
