import { describe, it, expect } from 'vitest'
import { formatMoney, parseMoney } from './money'

describe('formatMoney', () => {
  it('renders whole-dollar CAD with no cents', () => {
    // FR-CA groups with a non-breaking space and trails the "$"; assert on the
    // digits + symbol rather than the exact separator byte (locale data varies).
    const s = formatMoney(1_500_000, 'fr')
    expect(s).toMatch(/15\s?000/)
    expect(s).toContain('$')
  })
  it('renders EN-CA with a leading symbol', () => {
    expect(formatMoney(1_500_000, 'en')).toMatch(/\$\s?15,000/)
  })
  it('returns empty for null/undefined/NaN', () => {
    expect(formatMoney(null, 'fr')).toBe('')
    expect(formatMoney(undefined, 'fr')).toBe('')
    expect(formatMoney(Number.NaN, 'fr')).toBe('')
  })
})

describe('parseMoney', () => {
  it('parses plain dollars to cents', () => {
    expect(parseMoney('1500')).toBe(150_000)
  })
  it('tolerates a $, spaces, and thousands separators', () => {
    expect(parseMoney('$15 000')).toBe(1_500_000)
    expect(parseMoney('15,000')).toBe(1_500_000)
  })
  it('keeps a decimal point as cents', () => {
    expect(parseMoney('12.50')).toBe(1_250)
  })
  it('returns null for empty or non-numeric input', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
})
