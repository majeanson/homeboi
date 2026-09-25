import { describe, it, expect } from 'vitest'
import { pickMyNext, pickMyRoutine } from './pourToi'

// « Pour toi » (C2) — the selectors behind the one-line personal glance. What they must
// hold: only what is THEIRS, only what is still to come / fits the hour, nothing else.
describe('pickMyNext', () => {
  const now = 1_000_000
  const ev = (id: string, start_at: number, p: { member_id?: string | null; passengers?: string | null; all_day?: number } = {}) => ({
    id,
    start_at,
    all_day: p.all_day ?? 0,
    member_id: p.member_id ?? null,
    passengers: p.passengers ?? null,
  })

  it('is the soonest still-to-come rendez-vous that names this face', () => {
    const events = [ev('later', now + 7200, { member_id: 'm3' }), ev('soon', now + 600, { member_id: 'm3' }), ev('past', now - 60, { member_id: 'm3' })]
    expect(pickMyNext(events, 'm3', now)?.id).toBe('soon')
  })
  it('reads « Qui » (passengers) as well as the primary face', () => {
    // Red against reading member_id only: the co-passenger's glance would miss the ride.
    expect(pickMyNext([ev('ride', now + 600, { member_id: 'm1', passengers: '["m1","m3"]' })], 'm3', now)?.id).toBe('ride')
  })
  it('a family-wide item (no people) is not yours, and neither is someone else\'s', () => {
    expect(pickMyNext([ev('house', now + 600), ev('theirs', now + 600, { member_id: 'm4' })], 'm3', now)).toBeNull()
  })
  it('an all-day item has no clock to be next by', () => {
    expect(pickMyNext([ev('fete', now + 600, { member_id: 'm3', all_day: 1 })], 'm3', now)).toBeNull()
  })
})

describe('pickMyRoutine', () => {
  // 08:30 local — morning.
  const morning = new Date(2026, 5, 8, 8, 30).getTime()
  const r = (id: string, memberId: string, timeOfDay: string | null, cards = 1) => ({ id, memberId, timeOfDay, cards: Array.from({ length: cards }, () => ({})) })

  it('picks this face\'s routine for the current daypart', () => {
    expect(pickMyRoutine([r('dodo', 'm3', 'evening'), r('matin', 'm3', 'morning')], 'm3', morning)?.id).toBe('matin')
  })
  it('never someone else\'s routine', () => {
    // Red against dropping the memberId filter.
    expect(pickMyRoutine([r('matin', 'm4', 'morning')], 'm3', morning)).toBeUndefined()
  })
  it('never a LATER daypart\'s routine — « routine dodo » at breakfast is a nag, not a glance', () => {
    // Red against handing the list straight to pickMomentRoutine (it leans toward what
    // is coming and would answer « dodo »).
    expect(pickMyRoutine([r('dodo', 'm3', 'evening')], 'm3', morning)).toBeUndefined()
  })
  it('an anytime routine fits every hour; an empty one (no cards) never shows', () => {
    expect(pickMyRoutine([r('libre', 'm3', null)], 'm3', morning)?.id).toBe('libre')
    expect(pickMyRoutine([r('vide', 'm3', 'morning', 0)], 'm3', morning)).toBeUndefined()
  })
})
