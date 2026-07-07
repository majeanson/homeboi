import { beforeEach, describe, expect, it } from 'vitest'
import { bumpFrequent, frequentScores } from './frequents'

// C-20 (bmad/08): the per-device pick counter behind frequents-first comboboxes.

describe('frequents', () => {
  beforeEach(() => localStorage.clear())

  it('starts neutral: no picks → no scores', () => {
    expect(frequentScores('meal')).toEqual({})
  })

  it('more picks → higher score', () => {
    bumpFrequent('meal', 'tacos')
    bumpFrequent('meal', 'tacos')
    bumpFrequent('meal', 'soupe')
    const s = frequentScores('meal')
    expect(s.tacos).toBeGreaterThan(s.soupe)
    expect(s.soupe).toBeGreaterThan(0)
  })

  it('scopes are independent', () => {
    bumpFrequent('meal', 'tacos')
    expect(frequentScores('event-who')).toEqual({})
  })

  it('caps a scope by evicting the stalest entries', () => {
    for (let i = 0; i < 90; i++) bumpFrequent('meal', `item-${i}`)
    const s = frequentScores('meal')
    expect(Object.keys(s).length).toBeLessThanOrEqual(80)
    // The most recent picks survive; the very first fell off.
    expect(s['item-89']).toBeGreaterThan(0)
    expect(s['item-0']).toBeUndefined()
  })

  it('survives garbage in storage', () => {
    localStorage.setItem('babillard-frequents', '{not json')
    expect(frequentScores('meal')).toEqual({})
    bumpFrequent('meal', 'tacos') // must not throw; resets cleanly
    expect(frequentScores('meal').tacos).toBeGreaterThan(0)
  })
})
