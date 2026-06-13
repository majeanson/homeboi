import { describe, expect, it } from 'vitest'
import { splitItems } from './useVoiceInput'

// Voice add splits one spoken breath into multiple list items on natural list
// connectors — FR-CA first (et / pis / puis), plus comma and "and".
describe('splitItems', () => {
  it('keeps a single phrase as one item', () => {
    expect(splitItems('lait')).toEqual(['lait'])
    expect(splitItems('pain tranché')).toEqual(['pain tranché'])
  })

  it('splits on commas', () => {
    expect(splitItems('lait, œufs, pain')).toEqual(['lait', 'œufs', 'pain'])
  })

  it('splits on Québécois connectors et / pis / puis', () => {
    expect(splitItems('lait et œufs')).toEqual(['lait', 'œufs'])
    expect(splitItems('lait pis œufs')).toEqual(['lait', 'œufs'])
    expect(splitItems('lait puis œufs')).toEqual(['lait', 'œufs'])
  })

  it('splits on English "and"', () => {
    expect(splitItems('milk and eggs')).toEqual(['milk', 'eggs'])
  })

  it('mixes connectors and trims blanks', () => {
    expect(splitItems('lait, œufs pis pain')).toEqual(['lait', 'œufs', 'pain'])
    expect(splitItems('lait,  , pain')).toEqual(['lait', 'pain'])
  })

  it('does not split a connector inside a word', () => {
    // "etagere"/"andouille" must stay whole — only whole-word connectors split.
    expect(splitItems('andouille')).toEqual(['andouille'])
    expect(splitItems('pain et beurre')).toEqual(['pain', 'beurre'])
  })

  it('returns empty for blank input', () => {
    expect(splitItems('   ')).toEqual([])
  })
})
