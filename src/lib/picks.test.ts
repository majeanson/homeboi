import { describe, expect, it } from 'vitest'
import { matchListItem, type ListItem } from './picks'

// matchListItem — the ONE reuse-not-duplicate decision for flyer adds (deal ↔ item
// doctrine). The dangerous regressions are (a) a specific store-flyer product name
// no longer landing on its generic line, and (b) over-matching in the reverse
// direction (a generic search must not land on a specific line it's contained in).

const row = (id: string, text: string, extra: Partial<ListItem> = {}): ListItem => ({ id, text, ...extra })

describe('matchListItem', () => {
  it('matches the exact name, accent/case-insensitively', () => {
    const list = [row('a', 'Oeufs'), row('b', 'Pain')]
    expect(matchListItem(list, 'œufs')?.id).toBe('a')
  })

  it('matches a saved flyer synonym exactly', () => {
    const list = [row('a', 'Oeufs', { search_terms: '["eggs"]' })]
    expect(matchListItem(list, 'Eggs')?.id).toBe('a')
  })

  it('lands a specific flyer product name on its generic line (containment)', () => {
    const list = [row('a', 'Pommes'), row('b', 'Lait')]
    expect(matchListItem(list, 'Pomme Gala 3 lb')?.id).toBe('a')
    expect(matchListItem(list, 'Lait 2% 4L')?.id).toBe('b')
  })

  it('containment works through a synonym too', () => {
    const list = [row('a', 'Oeufs', { search_terms: '["eggs"]' })]
    expect(matchListItem(list, 'White Eggs Large 12')?.id).toBe('a')
  })

  it('does NOT match the reverse direction (generic query vs specific line)', () => {
    // A deal searched as "oeufs" must not ride on a chocolate-eggs line.
    const list = [row('a', 'Oeufs en chocolat')]
    expect(matchListItem(list, 'oeufs')).toBeNull()
  })

  it('never matches on sub-word fragments', () => {
    const list = [row('a', 'Ail')]
    expect(matchListItem(list, 'Volaille entière')).toBeNull()
  })

  it('prefers an open line over a checked twin', () => {
    const list = [row('a', 'Lait', { checked_at: 123 }), row('b', 'Lait')]
    expect(matchListItem(list, 'Lait 2% 4L')?.id).toBe('b')
  })

  it('falls back to a checked line when no open one matches', () => {
    const list = [row('a', 'Lait', { checked_at: 123 })]
    expect(matchListItem(list, 'lait')?.id).toBe('a')
  })

  it('prefers an exact match over a containment match', () => {
    const list = [row('a', 'Fromage en grains'), row('b', 'Fromage')]
    expect(matchListItem(list, 'fromage')?.id).toBe('b')
  })
})
