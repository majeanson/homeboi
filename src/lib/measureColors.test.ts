import { describe, it, expect } from 'vitest'
import { findMeasures } from './measure'
import { measureColor, measureScoops, DEFAULT_MEASURE_COLORS, DEFAULT_UNIT_FALLBACK } from './measureColors'

const m = (line: string) => findMeasures(line)[0]

describe('measureColor — whole multiples inherit the base tool colour', () => {
  it('tints a whole multiple with its 1-unit tool colour, not the mauve fallback', () => {
    expect(measureColor(m('2 c. à thé de sel'))).toBe(DEFAULT_MEASURE_COLORS['1|tsp'])
    expect(measureColor(m('3 c. à soupe de beurre'))).toBe(DEFAULT_MEASURE_COLORS['1|tbsp'])
    expect(measureColor(m('2 tasses de farine'))).toBe(DEFAULT_MEASURE_COLORS['1|cup'])
  })
  it('keeps an exact tool amount on its own colour', () => {
    expect(measureColor(m('1 c. à thé de sel'))).toBe(DEFAULT_MEASURE_COLORS['1|tsp'])
    expect(measureColor(m('1/4 c. à thé de sel'))).toBe(DEFAULT_MEASURE_COLORS['1/4|tsp'])
  })
  it('still falls back for a mixed / odd amount with no tool', () => {
    expect(measureColor(m('1 1/2 tasse de lait'))).toBe(DEFAULT_UNIT_FALLBACK.cup)
  })
  it('lets a household override for the exact amount win', () => {
    expect(measureColor(m('2 c. à thé de sel'), { '2|tsp': '#123456' })).toBe('#123456')
  })
})

describe('measureScoops — one circle per physical tool fill', () => {
  it('draws N base-tool circles for a whole multiple (no ×N, no fallback tint)', () => {
    expect(measureScoops(m('2 c. à thé de sel'))).toEqual([
      { color: DEFAULT_MEASURE_COLORS['1|tsp'], fill: 1 },
      { color: DEFAULT_MEASURE_COLORS['1|tsp'], fill: 1 },
    ])
  })
  it('draws one full circle for a fraction that has its own tool', () => {
    expect(measureScoops(m('1/4 c. à thé de sel'))).toEqual([{ color: DEFAULT_MEASURE_COLORS['1/4|tsp'], fill: 1 }])
  })
  it('splits a mixed amount into its whole + fraction tools (1½ tasse → 1 cup + ½ cup)', () => {
    expect(measureScoops(m('1 1/2 tasse de lait'))).toEqual([
      { color: DEFAULT_MEASURE_COLORS['1|cup'], fill: 1 },
      { color: DEFAULT_MEASURE_COLORS['1/2|cup'], fill: 1 },
    ])
  })
  it('honours a household override for the base tool', () => {
    expect(measureScoops(m('2 c. à soupe de miel'), { '1|tbsp': '#abcdef' })).toEqual([
      { color: '#abcdef', fill: 1 },
      { color: '#abcdef', fill: 1 },
    ])
  })
})
