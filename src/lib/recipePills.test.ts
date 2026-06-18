import { describe, it, expect } from 'vitest'
import { critTags, matchesCriterion, matchesCustom, type Criterion, type CustomPill } from './recipePills'
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
