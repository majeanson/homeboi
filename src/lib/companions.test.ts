import { describe, it, expect } from 'vitest'
import { companionMood, companionPool, companionTone, isCompanion, COMPANIONS } from './companions'
import { FR } from '../i18n'
import { EN } from '../i18n.en'
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

  it('collapses eight dayparts into three voices', () => {
    expect(companionTone('dawn')).toBe('early')
    expect(companionTone('morning')).toBe('early')
    expect(companionTone('noon')).toBe('day')
    expect(companionTone('afternoon')).toBe('day')
    for (const p of ['dusk', 'twilight', 'deep-twilight', 'night'] as DayPart[])
      expect(companionTone(p)).toBe('evening')
  })
})

// What the creature SAYS may know the story (which creature, where we are, what time
// it is) — never the child's performance. These tests pin that line.
describe('companionPool', () => {
  const lines = (t: typeof FR) => ({
    says: t.routines.companionSays,
    voices: t.routines.companionVoices,
    moments: t.routines.companionMoments,
    tones: t.routines.companionTones,
  })

  it('pools the creature’s own voice with the moment and the time of day', () => {
    const pool = companionPool(lines(FR), { companion: 'turtle', moment: 'last', tone: 'evening' })
    expect(pool).toContain('On prend notre temps.') // the turtle's, not the fox's
    expect(pool).toContain('La dernière image !') // where the story is
    expect(pool).toContain('Chut… c’est bientôt le dodo.') // what time it is
    expect(pool).not.toContain('J’ai un truc pour toi.') // the FOX's line — wrong creature
    expect(pool).not.toContain('On commence ensemble.') // a different moment
  })

  it('is far richer than the six lines it replaces (a creature that repeats becomes furniture)', () => {
    const pool = companionPool(lines(FR), { companion: 'fox', moment: 'mid', tone: 'early' })
    expect(pool.length).toBeGreaterThanOrEqual(12)
    expect(new Set(pool).size).toBe(pool.length) // no line pooled twice
  })

  it('drops the story-position lines at the finish — company, never congratulation', () => {
    const done = companionPool(lines(FR), { companion: 'fox', moment: null, tone: 'day' })
    for (const m of [...FR.routines.companionMoments.last, ...FR.routines.companionMoments.start])
      expect(done).not.toContain(m)
    // And nothing anywhere in the bank cheers a result — that's a reward, and rewards
    // are the one thing this creature must never hand out (calm tenets).
    const every = [FR, EN].flatMap((t) =>
      COMPANIONS.flatMap((c) =>
        (['early', 'day', 'evening'] as const).flatMap((tone) =>
          companionPool(lines(t as typeof FR), { companion: c, moment: null, tone }),
        ),
      ),
    )
    for (const line of every) expect(line).not.toMatch(/record|streak|points?\b|score|champion|gagné|winner|faster/i)
  })
})
