import { describe, it, expect } from 'vitest'
import { companionMood, isCompanion, COMPANIONS } from './companions'
import type { DayPart } from './timeofday'

describe('companion', () => {
  // The calm guarantee: the companion's pose depends ONLY on the daypart, never on
  // routine progress. So night-ish parts doze, everything else is awake — and there
  // is no code path that could feed it a done-count.
  it('dozes at night and deep-twilight, awake otherwise', () => {
    const dozing: DayPart[] = ['night', 'deep-twilight']
    const awake: DayPart[] = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'twilight']
    for (const p of dozing) expect(companionMood(p)).toBe('dozing')
    for (const p of awake) expect(companionMood(p)).toBe('awake')
  })

  it('validates the closed creature set (never free text)', () => {
    for (const c of COMPANIONS) expect(isCompanion(c)).toBe(true)
    expect(isCompanion('dragon')).toBe(false)
    expect(isCompanion('')).toBe(false)
    expect(isCompanion(null)).toBe(false)
    expect(isCompanion(3)).toBe(false)
  })
})
