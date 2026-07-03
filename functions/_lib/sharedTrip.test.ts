import { describe, it, expect } from 'vitest'
import { MAX_SHARED_HOUSEHOLDS, mapPackingMemberToBagLabel, matchBagLabelToMember } from './sharedTrip'

// Pure logic only (no D1): the household cap and the promote/export bag-label
// mapping. requireSharedTripMember/nudgeSharedTrip need a DB/DO and are covered by
// the e2e + manual smoke, not here.

describe('MAX_SHARED_HOUSEHOLDS', () => {
  it('is the locked product cap of 6', () => {
    expect(MAX_SHARED_HOUSEHOLDS).toBe(6)
  })
})

describe('mapPackingMemberToBagLabel (promote: member_id → bag_label)', () => {
  const names = new Map([
    ['m1', 'Léa'],
    ['m2', 'Papa'],
  ])

  it('maps a member id to that member display name', () => {
    expect(mapPackingMemberToBagLabel('m1', names)).toBe('Léa')
    expect(mapPackingMemberToBagLabel('m2', names)).toBe('Papa')
  })

  it('maps NULL / empty (the household shared bag) to NULL', () => {
    expect(mapPackingMemberToBagLabel(null, names)).toBeNull()
    expect(mapPackingMemberToBagLabel(undefined, names)).toBeNull()
    expect(mapPackingMemberToBagLabel('  ', names)).toBeNull()
  })

  it('falls back to the shared bag for a stale member ref no longer in the roster', () => {
    expect(mapPackingMemberToBagLabel('gone', names)).toBeNull()
  })
})

describe('matchBagLabelToMember (leave-export: bag_label → current member id)', () => {
  const members = [
    { id: 'm1', displayName: 'Léa' },
    { id: 'm2', displayName: 'Papa' },
  ]

  it('re-matches an exact name (trim + case-insensitive) back to the member id', () => {
    expect(matchBagLabelToMember('Léa', members)).toBe('m1')
    expect(matchBagLabelToMember('  papa ', members)).toBe('m2')
    expect(matchBagLabelToMember('LÉA', members)).toBe('m1')
  })

  it('returns NULL for the shared bag (NULL/empty label)', () => {
    expect(matchBagLabelToMember(null, members)).toBeNull()
    expect(matchBagLabelToMember('', members)).toBeNull()
  })

  it('returns NULL when no current member matches (never a fuzzy guess)', () => {
    expect(matchBagLabelToMember('Mamie', members)).toBeNull()
    expect(matchBagLabelToMember('Lé', members)).toBeNull()
  })
})
