import { describe, it, expect } from 'vitest'
import { emojiIcon, hexColor, hexColorOrNull } from './validate'

describe('hexColor', () => {
  it('accepts a valid 6-digit hex', () => {
    expect(hexColor('#88a36f', '#fallbk')).toBe('#88a36f')
  })
  it('accepts uppercase hex', () => {
    expect(hexColor('#ABCDEF', '#000000')).toBe('#ABCDEF')
  })
  it('rejects 3-digit shorthand', () => {
    expect(hexColor('#abc', '#000000')).toBe('#000000')
  })
  it('rejects a missing hash', () => {
    expect(hexColor('88a36f', '#000000')).toBe('#000000')
  })
  it('rejects non-hex characters', () => {
    expect(hexColor('#gggggg', '#000000')).toBe('#000000')
  })
  it('falls back on non-string input', () => {
    expect(hexColor(undefined, '#111111')).toBe('#111111')
    expect(hexColor(null, '#111111')).toBe('#111111')
    expect(hexColor(123, '#111111')).toBe('#111111')
  })
})

describe('emojiIcon (0148)', () => {
  it('keeps one emoji, a family emoji and a flag', () => {
    expect(emojiIcon(' 🍂 ')).toBe('🍂')
    expect(emojiIcon('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦')
    expect(emojiIcon('🇨🇦')).toBe('🇨🇦')
  })
  it('reads empty, text, markup and a long run as null: « comme le sujet »', () => {
    for (const v of ['', '   ', 'Gouttières', 'a🍂', '<b>', '🍂'.repeat(17), null, undefined, 3]) expect(emojiIcon(v)).toBeNull()
  })
})

describe('hexColorOrNull', () => {
  it('a hex stays, anything else is null', () => {
    expect(hexColorOrNull('#B06A93')).toBe('#B06A93')
    expect(hexColorOrNull('red')).toBeNull()
    expect(hexColorOrNull(null)).toBeNull()
  })
})
