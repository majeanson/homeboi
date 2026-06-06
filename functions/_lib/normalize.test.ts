// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { normalizeItem } from './normalize'

describe('normalizeItem', () => {
  it('folds ligatures and diacritics to a stable key', () => {
    expect(normalizeItem('Œufs')).toBe('oeufs')
    expect(normalizeItem('oeufs')).toBe('oeufs')
    expect(normalizeItem('Café')).toBe('cafe')
  })

  it('groups the same staple typed with different quantities', () => {
    const key = normalizeItem('œufs')
    expect(normalizeItem("2 douzaines d'œufs")).toBe(key)
    expect(normalizeItem('1 douzaine oeufs')).toBe(key)
  })

  it('strips a leading number + unit', () => {
    expect(normalizeItem('1L lait')).toBe('lait')
    expect(normalizeItem('500 g poulet')).toBe('poulet')
    expect(normalizeItem('2x pain')).toBe('pain')
  })

  it('does NOT eat a real word that merely starts with a unit letter', () => {
    // "1 lait" must keep "lait" — the leading "l" is not a litre unit here.
    expect(normalizeItem('1 lait')).toBe('lait')
    expect(normalizeItem('lait')).toBe('lait')
  })

  it('strips a trailing multiplier', () => {
    expect(normalizeItem('pain x2')).toBe('pain')
  })

  it('collapses whitespace and drops stray punctuation', () => {
    expect(normalizeItem('  Pain   tranché ')).toBe('pain tranche')
  })

  it('is idempotent', () => {
    for (const s of ['Œufs', '2 douzaines d’œufs', '1L lait', 'pain x2']) {
      expect(normalizeItem(normalizeItem(s))).toBe(normalizeItem(s))
    }
  })
})
