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
})
