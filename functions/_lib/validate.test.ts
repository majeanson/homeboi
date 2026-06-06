import { describe, it, expect } from 'vitest'
import { hexColor } from './validate'

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
