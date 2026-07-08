import { describe, expect, it } from 'vitest'
import { DISCOVERY_PROBES, buildDiscoveryTour, pickDaily } from './discovery'
import { GUIDE } from './guideContent'

// The « Le saviez-vous ? » probes + the adaptive discovery tour (bmad/08
// B-11 / A-5). Pure-logic guarantees: every probe points at a REAL guide card
// (a typo'd id would silently never surface), "unused" is only ever claimed on
// a positively-empty list (never on a missing/failed read), the daily rotation
// is deterministic, and the assembled tour hands each step off to its card.

describe('DISCOVERY_PROBES', () => {
  it('every probe targets an existing GUIDE card', () => {
    for (const p of DISCOVERY_PROBES) {
      expect(GUIDE.some((e) => e.id === p.card), `probe "${p.card}" has no GUIDE card`).toBe(true)
    }
  })

  it('claims unused ONLY on a positively empty array', () => {
    const voyage = DISCOVERY_PROBES.find((p) => p.card === 'voyage')!
    expect(voyage.unused({ trips: [] })).toBe(true)
    expect(voyage.unused({ trips: [{ id: 't1' }] })).toBe(false)
    // Absent field / wrong shape / failed read → NOT unused (never advertise on a hunch).
    expect(voyage.unused({})).toBe(false)
    expect(voyage.unused(null)).toBe(false)
    expect(voyage.unused(undefined)).toBe(false)
    expect(voyage.unused({ trips: 'nope' })).toBe(false)
  })
})

describe('pickDaily', () => {
  it('is deterministic and walks the list day by day', () => {
    const c = ['a', 'b', 'c']
    expect(pickDaily(c, 0)).toBe('a')
    expect(pickDaily(c, 1)).toBe('b')
    expect(pickDaily(c, 3)).toBe('a') // wraps
    expect(pickDaily(c, 4)).toBe(pickDaily(c, 4)) // same day, same card
  })

  it('returns null on no candidates', () => {
    expect(pickDaily([], 12345)).toBeNull()
  })
})

describe('buildDiscoveryTour', () => {
  it('returns null when nothing is unused', () => {
    expect(buildDiscoveryTour([])).toBeNull()
    expect(buildDiscoveryTour(['not-a-card'])).toBeNull()
  })

  it('assembles intro + one card-linked step per unused feature', () => {
    const tour = buildDiscoveryTour(['voyage', 'mots'])!
    expect(tour.id).toBe('discovery')
    expect(tour.steps).toHaveLength(3) // intro + 2
    expect(tour.steps[0].card).toBeUndefined() // the centred intro
    expect(tour.steps[1].card).toBe('voyage') // each stop hands off to its guide card
    expect(tour.steps[2].card).toBe('mots')
    // Bi parity — both languages present on every step (typeof-FR contract spirit).
    for (const s of tour.steps) {
      expect(s.title.fr.length).toBeGreaterThan(0)
      expect(s.title.en.length).toBeGreaterThan(0)
      expect(s.body.fr.length).toBeGreaterThan(0)
      expect(s.body.en.length).toBeGreaterThan(0)
    }
  })

  it('caps the tour at six stops (a whisper, not a lecture)', () => {
    const all = DISCOVERY_PROBES.map((p) => p.card)
    const tour = buildDiscoveryTour([...all, ...all])!
    expect(tour.steps.length).toBeLessThanOrEqual(7) // intro + max 6
  })
})
