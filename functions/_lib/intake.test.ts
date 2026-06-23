import { describe, it, expect } from 'vitest'
import { sanitizeIntake } from './intake'

// The defensive boundary for a relative's submitted form: a named self is required,
// junk is dropped, and counts/lengths are bounded so a hostile blob can't land.
describe('sanitizeIntake', () => {
  it('rejects a payload with no named self', () => {
    expect(sanitizeIntake(null)).toBeNull()
    expect(sanitizeIntake({})).toBeNull()
    expect(sanitizeIntake({ self: { firstName: '   ' } })).toBeNull()
    expect(sanitizeIntake('nope')).toBeNull()
  })

  it('keeps a clean self card and trims fields', () => {
    const out = sanitizeIntake({
      self: { firstName: '  Marie ', lastName: 'Tremblay', gender: 'f', birthday: '1990-04-02', email: 'm@x.ca' },
    })
    expect(out).not.toBeNull()
    expect(out!.self.firstName).toBe('Marie')
    expect(out!.self.gender).toBe('f')
    expect(out!.self.birthday).toBe('1990-04-02')
    expect(out!.household).toEqual([])
    expect(out!.links).toEqual([])
  })

  it('normalises a bad birthday/gender to null', () => {
    const out = sanitizeIntake({ self: { firstName: 'Bo', birthday: 'soon', gender: 'x' } })
    expect(out!.self.birthday).toBeNull()
    expect(out!.self.gender).toBeNull()
  })

  it('drops unnamed household entries but keeps named ones', () => {
    const out = sanitizeIntake({
      self: { firstName: 'A' },
      household: [{ firstName: 'Kid' }, { firstName: '' }, { lastName: 'noFirst' }],
    })
    expect(out!.household).toHaveLength(1)
    expect(out!.household[0].firstName).toBe('Kid')
  })

  it('keeps only valid links (in-range indices, known type, no self-loop)', () => {
    const out = sanitizeIntake({
      self: { firstName: 'A' },
      household: [{ firstName: 'B' }],
      links: [
        { aIndex: 1, bIndex: 0, type: 'child' }, // valid
        { aIndex: 0, bIndex: 0, type: 'child' }, // self-loop → dropped
        { aIndex: 5, bIndex: 0, type: 'child' }, // out of range → dropped
        { aIndex: 1, bIndex: 0, type: 'wizard' }, // unknown type → dropped
      ],
    })
    expect(out!.links).toEqual([{ aIndex: 1, bIndex: 0, type: 'child' }])
  })

  it('caps household length', () => {
    const household = Array.from({ length: 50 }, (_, i) => ({ firstName: `K${i}` }))
    const out = sanitizeIntake({ self: { firstName: 'A' }, household })
    expect(out!.household.length).toBeLessThanOrEqual(12)
  })
})
