import { describe, expect, it } from 'vitest'
import { pickNextMeal, recipeForMeal } from './nextMeal'
import { DEFAULT_SLOT_HOURS, slotAtMinute, type MealSlot } from './mealSlots'
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

// pickNextMeal speaks minutes-from-local-midnight; the tests read in hours.
const h = (hour: number, min = 0) => hour * 60 + min

describe('slotAtMinute — the slot you are about to cook, by the clock', () => {
  it('maps the day onto déjeuner → dîner → collation → souper → dessert', () => {
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(8))).toBe('breakfast')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(12))).toBe('lunch')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(15))).toBe('snack')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(18))).toBe('supper')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(21))).toBe('dessert')
  })

  it('looks FORWARD: once a meal is behind you it offers the next one', () => {
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(11))).toBe('lunch') // déjeuner already eaten
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(14))).toBe('snack')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(17))).toBe('supper')
  })

  it('clamps the small hours to the first meal of the day, not the last', () => {
    // 03h is before the déjeuner — we're waiting on it, not past the dessert.
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(3))).toBe('breakfast')
  })

  it('follows the household hours, not the built-in ones', () => {
    // A household that eats its souper at 19h is still heading to it at 18h, where a
    // 17h30 household would already be there.
    const late: Record<MealSlot, number> = { ...DEFAULT_SLOT_HOURS, supper: h(19) }
    expect(slotAtMinute(late, h(16))).toBe('snack')
    expect(slotAtMinute(late, h(18))).toBe('supper')
    expect(slotAtMinute(late, h(19))).toBe('supper')
  })
})

describe('pickNextMeal — the next planned meal to prepare', () => {
  const day = [meal('breakfast'), meal('lunch'), meal('supper')]

  it('returns the first planned slot that has not passed yet', () => {
    expect(pickNextMeal(day, h(7))?.slot).toBe('breakfast')
    expect(pickNextMeal(day, h(12))?.slot).toBe('lunch')
  })

  it('skips a slot with nothing planned to the next one that exists', () => {
    // No lunch planned at midday → jump to the souper.
    expect(pickNextMeal([meal('breakfast'), meal('supper')], h(12))?.slot).toBe('supper')
  })

  it('falls back to the last planned meal once the day is behind us', () => {
    // 21h, after every slot — still offer the souper rather than nothing.
    expect(pickNextMeal(day, h(21))?.slot).toBe('supper')
  })

  it('offers the dessert in the late evening when one is planned', () => {
    expect(pickNextMeal([...day, meal('dessert')], h(21))?.slot).toBe('dessert')
  })

  it('is undefined when nothing is planned', () => {
    expect(pickNextMeal([], h(12))).toBeUndefined()
  })

  it('ignores rows with an unknown slot', () => {
    expect(pickNextMeal([meal('brunch'), meal('supper')], h(8))?.slot).toBe('supper')
  })

  it('walks the CLOCK, not the household display order', () => {
    // A household that drags the dessert to the top of Réglages ▸ Repas has reordered
    // a list — at 07h the next meal to cook is still the déjeuner, not the dessert.
    expect(pickNextMeal([meal('dessert'), meal('breakfast')], h(7))?.slot).toBe('breakfast')
  })

  it('honours a household that shifted its souper later', () => {
    const late: Record<MealSlot, number> = { ...DEFAULT_SLOT_HOURS, supper: h(19) }
    // 18h: the souper hasn't started, so it's still what's coming up next.
    expect(pickNextMeal([meal('supper'), meal('dessert')], h(18), late)?.slot).toBe('supper')
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
