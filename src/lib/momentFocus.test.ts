import { describe, it, expect } from 'vitest'
import { momentFocus } from './momentFocus'

// Local-hour based; build instants at a given local hour.
const atHour = (h: number) => {
  const d = new Date(2026, 5, 24, h, 0, 0)
  return d.getTime()
}

describe('momentFocus', () => {
  it('leans on the day ahead in the morning', () => {
    expect(momentFocus(atHour(7))).toBe('day')
    expect(momentFocus(atHour(10))).toBe('day')
  })
  it('leans on supper through the afternoon into dinner', () => {
    expect(momentFocus(atHour(14))).toBe('supper')
    expect(momentFocus(atHour(18))).toBe('supper')
  })
  it('leans on the evening (tomorrow prep) as the day winds down', () => {
    expect(momentFocus(atHour(21))).toBe('evening')
  })
  it('emphasises nothing in the midday lull and late at night', () => {
    expect(momentFocus(atHour(12))).toBeNull()
    expect(momentFocus(atHour(2))).toBeNull()
    expect(momentFocus(atHour(23))).toBeNull()
  })

  // Réglages ▸ Repas can move the hero meal's serve time; the emphasis window follows
  // it, rather than staying pinned to the 14h–20h the default 17h30 souper produces.
  describe('follows the household hero-meal hour', () => {
    const at19h = 19 * 60
    it('opens the hero window relative to the meal, not at a fixed 14h', () => {
      expect(momentFocus(atHour(15), at19h)).toBeNull() // still the lull for a 19h souper
      expect(momentFocus(atHour(17), at19h)).toBe('supper')
    })
    it('slides the evening prep window later too', () => {
      expect(momentFocus(atHour(21), at19h)).toBe('supper') // not yet winding down
      expect(momentFocus(atHour(22), at19h)).toBe('evening')
    })
  })

  // A household may make the déjeuner its headline. The windows are clamped so that
  // can't lean on the hero card at 4 AM, nor spend the whole afternoon in "evening".
  describe('clamps an exotic morning hero', () => {
    const at7h = 7 * 60
    it('never leans on the hero in the small hours', () => {
      expect(momentFocus(atHour(4), at7h)).toBeNull()
    })
    it('gives a morning hero no hero lean at all — « day » already covers it', () => {
      expect(momentFocus(atHour(8), at7h)).toBe('day')
      expect(momentFocus(atHour(13), at7h)).toBeNull()
    })
    it('never starts the evening prep lean before 20h', () => {
      expect(momentFocus(atHour(16), at7h)).toBeNull()
      expect(momentFocus(atHour(20), at7h)).toBe('evening')
    })
  })
})
