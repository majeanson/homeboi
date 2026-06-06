import { describe, it, expect } from 'vitest'
import { findDurations, formatDuration } from './duration'

const secs = (text: string) => findDurations(text).map((d) => d.seconds)

describe('formatDuration', () => {
  it('formats minutes, hours, seconds, and mixes', () => {
    expect(formatDuration(20 * 60)).toBe('20 min')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(90 * 60)).toBe('1 h 30 min')
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(0)).toBe('0 s')
  })
})

describe('findDurations', () => {
  it('reads plain minutes (FR + EN)', () => {
    expect(secs('Faire mijoter 20 minutes.')).toEqual([1200])
    expect(secs('Bake for 25 min')).toEqual([1500])
    expect(secs('cuire 5 m à feu vif')).toEqual([300])
  })

  it('reads the 1h30 compound and bare hours', () => {
    expect(secs('Laisser reposer 1h30')).toEqual([5400])
    expect(secs('Cuire 1 h 30 min au four')).toEqual([5400])
    expect(secs('Mariner 2 heures')).toEqual([7200])
    expect(secs('rest 1.5 h')).toEqual([5400])
  })

  it('reads seconds', () => {
    expect(secs('Blanchir 45 secondes')).toEqual([45])
    expect(secs('whisk 30 s')).toEqual([30])
  })

  it('resolves a range to its upper bound', () => {
    expect(secs('Cuire 10-12 minutes')).toEqual([720])
    expect(secs('mijoter 10 à 15 min')).toEqual([900])
  })

  it('finds several distinct timers in one step, deduped', () => {
    expect(secs('Saisir 2 min par côté, puis 20 minutes au four')).toEqual([120, 1200])
    expect(secs('20 min, puis encore 20 minutes')).toEqual([1200])
  })

  it('does NOT misread non-time numbers as durations', () => {
    expect(secs('Ajouter 200 g de farine')).toEqual([])
    expect(secs('Verser 250 ml de lait')).toEqual([])
    expect(secs('Préchauffer à 180 degrés')).toEqual([])
    expect(secs('Mélanger 3 œufs')).toEqual([])
  })

  it('returns nothing for a step with no duration', () => {
    expect(secs('Saler et poivrer au goût.')).toEqual([])
  })
})
