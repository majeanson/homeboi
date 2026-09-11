import { describe, it, expect } from 'vitest'
import { formatMoney, formatMoneyExact, parseMoney } from './money'

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

describe('formatMoneyExact', () => {
  it('keeps the cents — a transfer has to match a bank statement', () => {
    const s = formatMoneyExact(311_282, 'fr')
    expect(s).toMatch(/3\s?112,82/)
    expect(s).toContain('$')
    expect(formatMoneyExact(311_282, 'en')).toMatch(/\$\s?3,112\.82/)
  })
  it('pads a round amount to two decimals rather than dropping them', () => {
    expect(formatMoneyExact(200_000, 'fr')).toMatch(/2\s?000,00/)
  })
  it('returns empty for null/undefined/NaN', () => {
    expect(formatMoneyExact(null, 'fr')).toBe('')
    expect(formatMoneyExact(undefined, 'fr')).toBe('')
    expect(formatMoneyExact(Number.NaN, 'fr')).toBe('')
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

// The comma rule. « 812,82 » used to parse as 81 282 $ — a hundredfold error, in the
// app's first language, on the one screen where the cents are the whole point.
describe('parseMoney — the FR-CA decimal comma', () => {
  it('reads a comma before two digits as cents', () => {
    expect(parseMoney('812,82')).toBe(81_282)
    expect(parseMoney('556,41')).toBe(55_641)
  })
  it('reads a comma before one digit as cents too', () => {
    expect(parseMoney('1,5')).toBe(150)
  })
  it('still strips a grouping comma', () => {
    expect(parseMoney('15,000')).toBe(1_500_000)
    expect(parseMoney('1,234,567')).toBe(123_456_700)
  })
  it('takes the rightmost separator as the decimal mark when both appear', () => {
    expect(parseMoney('1.234,56')).toBe(123_456)
    expect(parseMoney('1,234.56')).toBe(123_456)
  })
  it('handles the non-breaking space FR-CA formats with', () => {
    expect(parseMoney('3 112,82 $')).toBe(311_282)
  })
})
