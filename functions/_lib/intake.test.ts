import { describe, it, expect } from 'vitest'
import { sanitizeIntake, intakeMediaKeys } from './intake'

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

  it('accepts a valid staged photo key, rejects junk', () => {
    expect(sanitizeIntake({ self: { firstName: 'A', photoKey: 'ik_abc123' } })!.self.photoKey).toBe('ik_abc123')
    // path traversal / spaces / over-length → null (no photo)
    expect(sanitizeIntake({ self: { firstName: 'A', photoKey: '../secret' } })!.self.photoKey).toBeNull()
    expect(sanitizeIntake({ self: { firstName: 'A', photoKey: 'a'.repeat(200) } })!.self.photoKey).toBeNull()
  })

  it('keeps named pets, drops unnamed, clamps a bad owner to self', () => {
    const out = sanitizeIntake({
      self: { firstName: 'A' },
      pets: [
        { name: 'Rex', species: 'Chien', ownerIndex: 9 }, // owner out of range → 0 (self)
        { name: '', species: 'Chat' }, // unnamed → dropped
        { species: 'Poisson' }, // no name → dropped
      ],
    })
    expect(out!.pets).toHaveLength(1)
    expect(out!.pets[0]).toEqual({ name: 'Rex', species: 'Chien', photoKey: null, ownerIndex: 0 })
  })

  it('collects all media keys for cleanup', () => {
    const out = sanitizeIntake({
      self: { firstName: 'A', photoKey: 'ik_self' },
      household: [{ firstName: 'B', photoKey: 'ik_b' }],
      pets: [{ name: 'Rex', photoKey: 'ik_rex' }],
    })
    expect(intakeMediaKeys(out!).sort()).toEqual(['ik_b', 'ik_rex', 'ik_self'])
  })
})
