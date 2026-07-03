import { describe, it, expect } from 'vitest'
import { tripDays, tripCategoryIcon, TRIP_CATEGORIES, sharedNoteToTripNote, type SharedTripNote } from './voyage'
import { localDayStart, addLocalDays } from '../../lib/localDay'

// tripDays drives the Itinéraire tab (one section per day) AND the calendar band
// (which days a trip covers). It must be inclusive of both ends, DST-safe (it steps
// via addLocalDays, not a fixed +86400), and total/empty-safe for bad ranges.
describe('tripDays', () => {
  const d0 = localDayStart(new Date('2026-06-12T12:00:00'))
  const d2 = addLocalDays(d0, 2)

  it('returns every local-midnight day inclusive of both ends', () => {
    const days = tripDays(d0, d2)
    expect(days).toHaveLength(3)
    expect(days[0]).toBe(d0)
    expect(days[2]).toBe(d2)
    // strictly increasing, each one local-day apart
    expect(days[1]).toBe(addLocalDays(d0, 1))
  })

  it('is a single day when start === end', () => {
    expect(tripDays(d0, d0)).toEqual([d0])
  })

  it('is empty for a missing bound or an inverted range', () => {
    expect(tripDays(null, d2)).toEqual([])
    expect(tripDays(d0, null)).toEqual([])
    expect(tripDays(d2, d0)).toEqual([])
  })

  it('caps a runaway range rather than looping unbounded', () => {
    const far = addLocalDays(d0, 1000)
    expect(tripDays(d0, far, 120)).toHaveLength(120)
  })

  // Spans a spring-forward boundary (2026 DST in America/Toronto is 2026-03-08): the
  // day count must still be exact, not drift an hour into a wrong bucket.
  it('stays exact across a DST boundary', () => {
    const a = localDayStart(new Date('2026-03-07T12:00:00'))
    const b = addLocalDays(a, 3) // crosses the spring-forward
    expect(tripDays(a, b)).toHaveLength(4)
  })
})

// The adapter lets the household voyage components render a shared trip's notes
// unchanged: author_household_id becomes member_id, so `who={memberName(n.member_id)}`
// resolves to the authoring household's pseudo-face (id = household_id).
describe('sharedNoteToTripNote', () => {
  const base: SharedTripNote = {
    id: 'n1',
    shared_trip_id: 'st1',
    category: 'activity',
    label: 'Musée',
    text: 'Visite du musée',
    media_kind: null,
    media_key: null,
    scene_key: null,
    author_household_id: 'hh-A',
    author_label: 'Chez Marc',
    date: 1_700_000_000,
    position: 2,
    created_at: 1_699_000_000,
    updated_at: null,
  }

  it('maps author_household_id onto member_id (attribution via household faces)', () => {
    const out = sharedNoteToTripNote(base)
    expect(out.member_id).toBe('hh-A')
    expect(out.trip_id).toBe('st1')
    expect(out.category).toBe('activity')
    expect(out.text).toBe('Visite du musée')
    expect(out.date).toBe(1_700_000_000)
    // no author_* fields leak into the TripNote shape
    expect('author_household_id' in out).toBe(false)
    expect('shared_trip_id' in out).toBe(false)
  })

  it('carries media fields through and tolerates a null author', () => {
    const drawing = sharedNoteToTripNote({
      ...base,
      author_household_id: null,
      media_kind: 'drawing',
      media_key: 'st_abc.png',
      scene_key: 'ss_abc.json',
    })
    expect(drawing.member_id).toBeNull()
    expect(drawing.media_kind).toBe('drawing')
    expect(drawing.media_key).toBe('st_abc.png')
    expect(drawing.scene_key).toBe('ss_abc.json')
  })
})

describe('trip categories', () => {
  it('every category resolves to a real shared icon', () => {
    for (const c of TRIP_CATEGORIES) expect(tripCategoryIcon(c.key)).toBe(c.icon)
  })
  it('an unknown category falls back, never throws', () => {
    // @ts-expect-error — defensive: a stale row could carry an unknown category.
    expect(tripCategoryIcon('mystery')).toBe('push-pin-bold')
  })
})
