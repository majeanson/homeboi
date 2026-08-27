import { describe, expect, it } from 'vitest'
import { lineMatches, normTerms, parseTerms } from './listMatch'
import { normalizeItem } from './normalize'

// The SERVER mirror of src/lib/picks.test.ts — same cases, so the backstop that
// runs on a cold client cache can't drift from the client's decision.

const line = (text: string, search_terms: string | null = null) => ({ text, search_terms })
const matches = (name: string, row: { text: string; search_terms: string | null }) =>
  lineMatches(normalizeItem(name), row)

describe('lineMatches', () => {
  it('matches the exact name, accent/case-insensitively', () => {
    expect(matches('œufs', line('Oeufs'))).toBe(true)
    expect(matches('Pain', line('Oeufs'))).toBe(false)
  })

  it('matches a saved synonym exactly', () => {
    expect(matches('Eggs', line('Oeufs', '["eggs"]'))).toBe(true)
  })

  it('lands a specific flyer product name on its generic line', () => {
    expect(matches('Pomme Gala 3 lb', line('Pommes'))).toBe(true)
    expect(matches('White Eggs Large 12', line('Oeufs', '["eggs"]'))).toBe(true)
  })

  it('does NOT match the reverse direction, nor sub-word fragments', () => {
    expect(matches('oeufs', line('Oeufs en chocolat'))).toBe(false)
    expect(matches('Volaille entière', line('Ail'))).toBe(false)
  })

  it('unpacks a synonym typed as ONE comma list', () => {
    // What a household actually types in the edit sheet — before the split, this
    // line never recognized its own flyer names.
    const poulet = line('Poulet', '["chicken, chicken breast, poitrine"]')
    expect(matches('Chicken Breast, Boneless', poulet)).toBe(true)
    expect(matches('Chicken Thighs', poulet)).toBe(true)
  })

  it('survives malformed synonyms by matching on the name alone', () => {
    expect(matches('Lait 2% 4L', line('Lait', 'not json'))).toBe(true)
    expect(parseTerms('not json')).toEqual([])
  })
})

describe('normTerms', () => {
  it('splits, trims, dedupes (accent/case-insensitively) and caps at 12', () => {
    expect(normTerms(['apple, apples', ' pomme ', 'Pomme', ''])).toEqual(['apple', 'apples', 'pomme'])
    expect(normTerms(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12)
    expect(normTerms('nope')).toEqual([])
  })
})
