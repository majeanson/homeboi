import { describe, it, expect } from 'vitest'
import { fold, foldRanges } from './normalize'

// foldRanges backs the Guide-search <mark> highlight: match through fold()
// (accents/case dropped) but return index ranges into the ORIGINAL string.
describe('foldRanges', () => {
  it('finds a plain match', () => {
    expect(foldRanges('the board', 'board')).toEqual([[4, 9]])
  })

  it('is case-insensitive', () => {
    expect(foldRanges('Réglages', 'RÉGLAGES')).toEqual([[0, 8]])
  })

  it('matches accented text from an unaccented needle (and back)', () => {
    // "reglages" must light up « Réglages » — the FR-CA keyboard reality.
    expect(foldRanges('Réglages ▸ Guide', 'reglages')).toEqual([[0, 8]])
    expect(foldRanges('les reglages', 'réglages')).toEqual([[4, 12]])
  })

  it('returns every occurrence, non-overlapping', () => {
    expect(foldRanges('un été, un étage', 'et')).toEqual([
      [3, 5],
      [11, 13],
    ])
  })

  it('maps indexes through decomposed (NFD) originals', () => {
    // "é" as e + combining accent: 2 chars in the original, 1 after fold. The
    // range must swallow the trailing combining mark so the highlight doesn't
    // split the final accent from its base char.
    const s = 'déjà vu'.normalize('NFD')
    expect(fold(s)).toBe('deja vu')
    const [range] = foldRanges(s, 'déjà')
    expect(s.slice(range[0], range[1])).toBe('déjà'.normalize('NFD'))
  })

  it('returns nothing for an empty needle or no match', () => {
    expect(foldRanges('souper', '')).toEqual([])
    expect(foldRanges('souper', 'dîner')).toEqual([])
  })
})
