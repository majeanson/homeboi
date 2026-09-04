import { describe, it, expect } from 'vitest'
import { critTags, matchesCriterion, matchesCustom, slotPriorityLabel, type Criterion, type CustomPill, type BuiltinPill } from './recipePills'
import { type Recipe } from './recipes'

// A minimal recipe — the pill logic only reads tags / id / image / timing.
const recipe = (tags: string[], over: Partial<Recipe> = {}): Recipe =>
  ({ id: 'r1', title: 'x', ingredients: [], steps: [], tags, ...over }) as unknown as Recipe

const noLove = new Set<string>()

describe('critTags', () => {
  it('reads the multi-tag array shape', () => {
    expect(critTags({ field: 'tag', tags: ['Végé', 'Végan'] })).toEqual(['Végé', 'Végan'])
  })
  it('reads the legacy single-tag shape', () => {
    expect(critTags({ field: 'tag', tag: 'Souper' } as unknown as Criterion)).toEqual(['Souper'])
  })
  it('is empty for a non-tag criterion or an empty rule', () => {
    expect(critTags({ field: 'favorite' })).toEqual([])
    expect(critTags({ field: 'tag', tags: [] })).toEqual([])
  })
})

describe('matchesCriterion — tag OR', () => {
  const rule: Criterion = { field: 'tag', tags: ['Végé', 'Végan'] }
  it('matches a recipe carrying ANY of the tags (case-insensitive)', () => {
    expect(matchesCriterion(recipe(['végan']), rule, noLove)).toBe(true)
    expect(matchesCriterion(recipe(['Végé']), rule, noLove)).toBe(true)
  })
  it('rejects a recipe carrying none of them', () => {
    expect(matchesCriterion(recipe(['Carné']), rule, noLove)).toBe(false)
  })
  it('an empty tag rule matches nothing', () => {
    expect(matchesCriterion(recipe(['Végé']), { field: 'tag', tags: [] }, noLove)).toBe(false)
  })
})

describe('matchesCustom — OR within a rule, AND across rules', () => {
  // "Souper végé rapide" = (tag Végé OR Végan) AND total ≤ 30 min.
  const pill: CustomPill = {
    id: 'p1',
    label: 'Souper végé rapide',
    rules: [
      { field: 'tag', tags: ['Végé', 'Végan'] },
      { field: 'totalMin', op: 'lte', n: 30 },
    ],
  }
  it('matches when one tag matches AND the time fits', () => {
    expect(matchesCustom(recipe(['Végan'], { prepMin: 10, cookMin: 15 }), pill, noLove)).toBe(true)
  })
  it('fails when the tag matches but the time rule does not', () => {
    expect(matchesCustom(recipe(['Végan'], { prepMin: 40, cookMin: 20 }), pill, noLove)).toBe(false)
  })
  it('fails when neither tag matches even if the time fits', () => {
    expect(matchesCustom(recipe(['Carné'], { prepMin: 5, cookMin: 10 }), pill, noLove)).toBe(false)
  })
})

describe('slotPriorityLabel — meal-slot association ("Dîner & Souper" pill), and WHICH pill lifted', () => {
  const dinerSouper: CustomPill = {
    id: 'p1',
    label: 'Dîner & Souper',
    rules: [{ field: 'tag', tags: ['Diner-Souper'] }],
    slots: ['lunch', 'supper'],
  }
  const soupOnly: CustomPill = {
    id: 'p2',
    label: 'Soupers seulement',
    rules: [{ field: 'tag', tags: ['Soupe'] }],
    slots: ['supper'],
  }
  const noSlotPill: CustomPill = { id: 'p3', label: 'Sans lien repas', rules: [{ field: 'tag', tags: ['Soupe'] }] }
  const builtin: BuiltinPill = { k: 'cookable' }

  it("names the matching pill for a recipe tagged for a pill that claims the given slot", () => {
    const test = slotPriorityLabel([dinerSouper], 'supper', noLove)
    expect(test(recipe(['Diner-Souper']))).toBe('Dîner & Souper')
    expect(test(recipe(['Autre chose']))).toBeNull()
  })

  it('the SAME pill applies at every slot it lists', () => {
    const r = recipe(['Diner-Souper'])
    expect(slotPriorityLabel([dinerSouper], 'lunch', noLove)(r)).toBe('Dîner & Souper')
    expect(slotPriorityLabel([dinerSouper], 'supper', noLove)(r)).toBe('Dîner & Souper')
    expect(slotPriorityLabel([dinerSouper], 'breakfast', noLove)(r)).toBeNull()
  })

  it('a pill scoped to one slot does not leak priority into another', () => {
    const r = recipe(['Soupe'])
    expect(slotPriorityLabel([soupOnly], 'supper', noLove)(r)).toBe('Soupers seulement')
    expect(slotPriorityLabel([soupOnly], 'lunch', noLove)(r)).toBeNull()
  })

  it('a pill with no slots, a hidden (off) pill, and a built-in pill never grant priority', () => {
    const r = recipe(['Soupe'])
    expect(slotPriorityLabel([noSlotPill], 'supper', noLove)(r)).toBeNull()
    expect(slotPriorityLabel([{ ...soupOnly, off: true }], 'supper', noLove)(r)).toBeNull()
    expect(slotPriorityLabel([builtin], 'supper', noLove)(r)).toBeNull()
  })

  it('an empty pill list always returns null, cheaply (no active pills to test)', () => {
    expect(slotPriorityLabel([], 'supper', noLove)(recipe(['Soupe']))).toBeNull()
  })

  it('the FIRST matching pill wins when several claim the same slot', () => {
    const test = slotPriorityLabel([dinerSouper, soupOnly], 'supper', noLove)
    // Matches both (Diner-Souper AND Soupe tags) — dinerSouper is first in the list.
    expect(test(recipe(['Diner-Souper', 'Soupe']))).toBe('Dîner & Souper')
  })

  // The picker partitions on `!== null`, not on truthiness — an unnamed pill still
  // lifts its recipes, it just has no name to show as the reason.
  it('an unnamed pill lifts with an EMPTY label, which is not the same as null', () => {
    const unnamed: CustomPill = { ...soupOnly, label: '' }
    expect(slotPriorityLabel([unnamed], 'supper', noLove)(recipe(['Soupe']))).toBe('')
  })
})
