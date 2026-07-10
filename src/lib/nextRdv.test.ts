import { describe, it, expect } from 'vitest'
import { nextOccurrence, nextRdvFor, type RdvSource } from './nextRdv'

// Anchor times are built with `new Date(y, m, d, h, min)` (browser-local) so the test
// runs identically regardless of the machine's tz — the helper is browser-local too.
const at = (y: number, m: number, d: number, h = 9, min = 0) => Math.floor(new Date(y, m - 1, d, h, min).getTime() / 1000)
const now = (y: number, m: number, d: number, h = 8, min = 0) => new Date(y, m - 1, d, h, min).getTime()

describe('nextOccurrence — one-offs', () => {
  it('returns a future one-off unchanged', () => {
    expect(nextOccurrence(at(2026, 8, 1), null, now(2026, 7, 10))).toBe(at(2026, 8, 1))
  })
  it('returns today\'s one-off even if the hour has passed (still today)', () => {
    // start-of-today inclusive: a 09:00 appointment is still "next" at 14:00 the same day.
    expect(nextOccurrence(at(2026, 7, 10, 9), null, now(2026, 7, 10, 14))).toBe(at(2026, 7, 10, 9))
  })
  it('drops a one-off from a past day', () => {
    expect(nextOccurrence(at(2026, 7, 1), null, now(2026, 7, 10))).toBeNull()
  })
})

describe('nextOccurrence — recurrence', () => {
  it('weekly: next matching weekday from an old anchor', () => {
    // Anchor Wed 2026-07-01 09:00, weekly. From Fri 2026-07-10 → next Wed is 07-15.
    const a = at(2026, 7, 1, 9)
    const next = nextOccurrence(a, JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [3] }), now(2026, 7, 10))
    expect(next).toBe(at(2026, 7, 15, 9))
  })
  it('biweekly: skips the off-week', () => {
    // Anchor Wed 2026-07-01, every 2 weeks. 07-15 is the off week → next is 07-29.
    const a = at(2026, 7, 1, 9)
    const next = nextOccurrence(a, JSON.stringify({ freq: 'weekly', interval: 2, weekdays: [3] }), now(2026, 7, 16))
    expect(next).toBe(at(2026, 7, 29, 9))
  })
  it('monthly: same day-of-month next month', () => {
    const a = at(2026, 1, 5, 10)
    const next = nextOccurrence(a, JSON.stringify({ freq: 'monthly', interval: 1 }), now(2026, 7, 10))
    expect(next).toBe(at(2026, 8, 5, 10))
  })
  it('yearly: rolls to next year once past', () => {
    const a = at(2024, 3, 19, 9)
    const next = nextOccurrence(a, JSON.stringify({ freq: 'yearly', interval: 1 }), now(2026, 7, 10))
    expect(next).toBe(at(2027, 3, 19, 9))
  })
})

describe('nextRdvFor — soonest across matching events', () => {
  const events: (RdvSource & { contact_id: string | null; business_id: string | null })[] = [
    { title: 'Dentiste', start_at: at(2026, 8, 20), all_day: 0, recur_json: null, contact_id: null, business_id: 'b1' },
    { title: 'Vaccin', start_at: at(2026, 8, 3), all_day: 0, recur_json: null, contact_id: null, business_id: 'b1' },
    { title: 'Autre', start_at: at(2026, 8, 1), all_day: 0, recur_json: null, contact_id: null, business_id: 'b2' },
  ]
  it('picks the earliest occurrence for the matched business', () => {
    const r = nextRdvFor(events, (e) => e.business_id === 'b1', now(2026, 7, 10))
    expect(r?.title).toBe('Vaccin')
    expect(r?.at).toBe(at(2026, 8, 3))
  })
  it('returns null when nothing matches or all are past', () => {
    expect(nextRdvFor(events, (e) => e.business_id === 'nope', now(2026, 7, 10))).toBeNull()
    expect(nextRdvFor(events, (e) => e.business_id === 'b2', now(2026, 9, 1))).toBeNull()
  })
})
