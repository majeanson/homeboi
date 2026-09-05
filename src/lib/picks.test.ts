import { describe, expect, it } from 'vitest'
import { matchListItem, sameItemName, type ListItem } from './picks'

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

describe('matchListItem — synonyms typed as one comma list', () => {
  // The edit sheet takes one chip at a time, but a household types the whole set
  // into one ("chicken, chicken breast, poitrine"). The deals lookup has always
  // split ?terms= that way; matching now does too, so the line that carries the
  // synonyms recognizes its own flyer names instead of spawning a duplicate.
  const poulet = row('a', 'Poulet', { search_terms: '["chicken, chicken breast, poitrine"]' })

  it('matches through a comma-listed synonym', () => {
    expect(matchListItem([poulet], 'Chicken Breast, Boneless')?.id).toBe('a')
    expect(matchListItem([poulet], 'Chicken Thighs')?.id).toBe('a')
    expect(matchListItem([poulet], 'chicken')?.id).toBe('a')
  })

  it('still refuses an unrelated flyer name', () => {
    expect(matchListItem([poulet], 'Lait 2% 4L')).toBeNull()
  })
})

// The flyer zoom's caption prints the product name under the head line — but the head
// already reads « <item> · <store> », and adding an item STRAIGHT FROM THE FLYER names
// the list line after that product. So the caption said the same thing twice:
//   MELON D'EAU ENTIER SANS PÉPINS, ENVIRON 9 LB · Maxi
//   MELON D'EAU ENTIER SANS PÉPINS, ENVIRON 9 LB
// It now asks this — the exact-match tier of matchListItem, i.e. the same notion of
// "the same item" that linked the deal onto the line to begin with.
describe('sameItemName', () => {
  it('is true for the exact duplicate the caption was printing twice', () => {
    expect(sameItemName("MELON D'EAU ENTIER SANS PÉPINS, ENVIRON 9 LB", "Melon d'eau entier sans pépins, environ 9 lb")).toBe(true)
  })

  it('ignores accents, case and punctuation', () => {
    expect(sameItemName('Œufs', 'oeufs')).toBe(true)
    expect(sameItemName('pain tranché', 'Pain tranche')).toBe(true)
  })

  it('ignores a leading quantity, the way the deal matcher does', () => {
    expect(sameItemName('2 lb de pommes', 'pommes')).toBe(true)
  })

  it('is FALSE when the product name genuinely adds something', () => {
    // The whole point of the second line: a generic list item + a specific product.
    expect(sameItemName("MELON D'EAU ENTIER SANS PÉPINS, ENVIRON 9 LB", "melon d'eau")).toBe(false)
    expect(sameItemName('Pain', 'Lait')).toBe(false)
  })

  it('an empty name is never "the same" as anything', () => {
    expect(sameItemName('', 'pain')).toBe(false)
    expect(sameItemName('   ', 'pain')).toBe(false)
  })
})
