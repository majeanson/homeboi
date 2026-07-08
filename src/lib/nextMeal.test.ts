import { describe, expect, it } from 'vitest'
import { currentSlotRank, pickNextMeal, recipeForMeal } from './nextMeal'
import { SLOT_RANK } from './mealSlots'
import { type MealRow } from '../components/kitchen/types'
import { type Recipe } from './recipes'

const meal = (slot: string, over: Partial<MealRow> = {}): MealRow => ({
  id: slot,
  date: 0,
  slot,
  title: slot,
  cook_member_id: null,
  ...over,
})

describe('currentSlotRank — the slot you are about to cook, by hour', () => {
  it('maps the day onto déjeuner → dîner → collation → souper → dessert', () => {
    expect(currentSlotRank(8)).toBe(SLOT_RANK.breakfast)
    expect(currentSlotRank(12)).toBe(SLOT_RANK.lunch)
    expect(currentSlotRank(15)).toBe(SLOT_RANK.snack)
    expect(currentSlotRank(19)).toBe(SLOT_RANK.supper)
    expect(currentSlotRank(21)).toBe(SLOT_RANK.dessert)
  })

  it('treats the boundaries as the start of the NEXT slot', () => {
    expect(currentSlotRank(10)).toBe(SLOT_RANK.lunch) // 10h is no longer déjeuner
    expect(currentSlotRank(14)).toBe(SLOT_RANK.snack)
    expect(currentSlotRank(16)).toBe(SLOT_RANK.supper)
    expect(currentSlotRank(20)).toBe(SLOT_RANK.dessert)
  })
})

describe('pickNextMeal — the next planned meal to prepare', () => {
  const day = [meal('breakfast'), meal('lunch'), meal('supper')]

  it('returns the first planned slot that has not passed yet', () => {
    expect(pickNextMeal(day, 7)?.slot).toBe('breakfast')
    expect(pickNextMeal(day, 12)?.slot).toBe('lunch')
  })

  it('skips a slot with nothing planned to the next one that exists', () => {
    // No lunch planned at midday → jump to the souper.
    expect(pickNextMeal([meal('breakfast'), meal('supper')], 12)?.slot).toBe('supper')
  })

  it('falls back to the last planned meal once the day is behind us', () => {
    // 21h, after every slot — still offer the souper rather than nothing.
    expect(pickNextMeal(day, 21)?.slot).toBe('supper')
  })

  it('offers the dessert in the late evening when one is planned', () => {
    expect(pickNextMeal([...day, meal('dessert')], 21)?.slot).toBe('dessert')
  })

  it('is undefined when nothing is planned', () => {
    expect(pickNextMeal([], 12)).toBeUndefined()
  })

  it('ignores rows with an unknown slot', () => {
    expect(pickNextMeal([meal('brunch'), meal('supper')], 8)?.slot).toBe('supper')
  })
})

describe('recipeForMeal — link a planned meal to a saved recipe', () => {
  const recipes: Recipe[] = [
    { id: 'r1', title: 'Spaghetti', ingredients: [], steps: [], servings: null, notes: null, source: null, image: null, tags: [], updatedAt: 0 },
    { id: 'r2', title: 'Pâté chinois', ingredients: [], steps: [], servings: null, notes: null, source: null, image: null, tags: [], updatedAt: 0 },
  ]

  it('prefers the exact recipe_id link', () => {
    expect(recipeForMeal(meal('supper', { recipe_id: 'r2', title: 'Spaghetti' }), recipes)?.id).toBe('r2')
  })

  it('falls back to a case/space-insensitive title match', () => {
    expect(recipeForMeal(meal('supper', { title: '  spaghetti ' }), recipes)?.id).toBe('r1')
  })

  it('is undefined for a free-text meal with no match', () => {
    expect(recipeForMeal(meal('supper', { title: 'leftovers' }), recipes)).toBeUndefined()
  })
})
