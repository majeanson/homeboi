import { describe, expect, it } from 'vitest'
import { restoredMealRow } from './EntityRemovals'

// « Retirer du plan » → « Annuler » must put the meal back WITH its recipe link.
// 2026-11-05: the board/month undo re-POSTed `{date, slot, title}` and dropped
// `recipe_id` (the day scene's undo kept it). Red against that code: the old body had
// no recipe field at all.
describe('restoredMealRow', () => {
  it('keeps the recipe link through the round trip', () => {
    const row = restoredMealRow({ id: 'm1', title: 'Spaghetti maison', slot: 'supper', day: 1_749_355_200, recipe_id: 'rc1' })
    expect(row).toMatchObject({ id: 'm1', date: 1_749_355_200, slot: 'supper', title: 'Spaghetti maison', recipe_id: 'rc1' })
  })

  it('a meal with no recipe restores as such (null, never undefined — the POST body is explicit)', () => {
    expect(restoredMealRow({ id: 'm2', title: 'Restes', slot: 'lunch', day: 0 }).recipe_id).toBeNull()
  })
})
