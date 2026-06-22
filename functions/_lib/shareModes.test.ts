import { describe, it, expect } from 'vitest'
import { clampShareTtl, cleanShareField } from './shareModes'

const MIN = 30 * 60
const DAY = 24 * 60 * 60

describe('clampShareTtl', () => {
  it('falls back to the per-kind default when unset/garbage', () => {
    expect(clampShareTtl('showcase', undefined)).toBe(DAY)
    expect(clampShareTtl('sitter', undefined)).toBe(12 * 60 * 60)
    expect(clampShareTtl('welcome', null)).toBe(4 * 60 * 60)
    expect(clampShareTtl('sitter', 'abc')).toBe(12 * 60 * 60)
  })

  it('clamps to the floor (30 min) for every kind', () => {
    for (const k of ['showcase', 'sitter', 'welcome'] as const) {
      expect(clampShareTtl(k, 60)).toBe(MIN)
      expect(clampShareTtl(k, 0)).toBe(MIN)
    }
  })

  it('caps sitter/welcome at 24 h but lets showcase + family run to 7 days', () => {
    expect(clampShareTtl('sitter', 30 * DAY)).toBe(DAY)
    expect(clampShareTtl('welcome', 30 * DAY)).toBe(DAY)
    expect(clampShareTtl('showcase', 30 * DAY)).toBe(7 * DAY)
    expect(clampShareTtl('family', 30 * DAY)).toBe(7 * DAY)
    expect(clampShareTtl('family', undefined)).toBe(7 * DAY) // standing pane defaults to a week
  })

  it('passes a valid in-range request through (floored to whole seconds)', () => {
    expect(clampShareTtl('showcase', 2 * DAY)).toBe(2 * DAY)
    expect(clampShareTtl('sitter', 3600.9)).toBe(3600)
  })
})

describe('cleanShareField', () => {
  it('trims, and empties become null (so the field hides)', () => {
    expect(cleanShareField('  hello  ')).toBe('hello')
    expect(cleanShareField('   ')).toBeNull()
    expect(cleanShareField('')).toBeNull()
    expect(cleanShareField(undefined)).toBeNull()
    expect(cleanShareField(42)).toBeNull()
  })

  it('caps length', () => {
    expect(cleanShareField('x'.repeat(1000))?.length).toBe(500)
  })
})
