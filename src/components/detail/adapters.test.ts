import { describe, it, expect } from 'vitest'
import { buildMeal, type DetailCtx } from './adapters'
import { FR } from '../../i18n'

// The meal peek's DOORS. Every tapped meal reaches `buildMeal`, so what it offers is
// what a household can do with a planned meal — and for a long time a FREE-TEXT meal
// (« Muffins maison » typed straight into a slot, no saved recipe) was offered nothing
// about preparing it: the peek listed the day and how to delete it, and that was all.
// Reported from the phone as "meals without recipes don't pop off to prepare".

const ctx: DetailCtx = { t: FR, lang: 'fr', members: [] }
const meal = (over: Record<string, unknown> = {}) => ({ id: 'm1', title: 'Muffins maison', slot: 'snack', cook_member_id: null, ...over }) as never
const keys = (m: ReturnType<typeof buildMeal>) => m.actions?.map((a) => a.key) ?? []
const hrefOf = (m: ReturnType<typeof buildMeal>, key: string) => m.actions?.find((a) => a.key === key)?.href

describe('buildMeal — what you can do with a planned meal', () => {
  it('a meal WITH a recipe offers reading it and cooking it', () => {
    const m = buildMeal(meal(), ctx, { daySec: 1_749_355_200, recipeId: 'rc1' })
    expect(keys(m)).toContain('cook')
    expect(keys(m)).toContain('recipe')
    // …and NOT the choose-a-recipe door: it already has one.
    expect(keys(m)).not.toContain('pick-recipe')
    expect(hrefOf(m, 'cook')).toBe('/kitchen/recipe/rc1/cook')
  })

  it('a meal WITHOUT a recipe offers to give it one', () => {
    const m = buildMeal(meal(), ctx, { daySec: 1_749_355_200 })
    expect(keys(m)).toContain('pick-recipe')
    expect(keys(m)).not.toContain('cook')
  })

  it('…and that door lands on THAT meal’s own composer, not the day in general', () => {
    // The door-lands-on-its-target rule (ACTIONS.md): « Choisir une recette » on a
    // collation must open the COLLATION, not the headline supper.
    const m = buildMeal(meal(), ctx, { daySec: 1_749_355_200 })
    expect(hrefOf(m, 'pick-recipe')).toBe('/kitchen/day/1749355200?vue=repas&focus=meal:snack')
  })

  it('an unknown slot still gets a door, just an unfocused one', () => {
    const m = buildMeal(meal({ slot: 'brunch' }), ctx, { daySec: 1_749_355_200 })
    expect(hrefOf(m, 'pick-recipe')).toBe('/kitchen/day/1749355200?vue=repas&focus=meal')
  })

  it('with no day to go to, it offers no recipe door at all rather than a dead one', () => {
    const m = buildMeal(meal(), ctx, {})
    expect(keys(m)).not.toContain('pick-recipe')
  })

  it('a leftover is not something to find a recipe for', () => {
    // It is already cooked — the peek says so instead (the leftovers tag block).
    const m = buildMeal(meal({ is_leftover: 1 }), ctx, { daySec: 1_749_355_200 })
    expect(m.blocks?.length).toBeGreaterThan(0)
  })
})
