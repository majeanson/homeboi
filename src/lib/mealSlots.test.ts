import { describe, expect, it } from 'vitest'
import { MEAL_SLOTS, SIDE_SLOTS, SLOT_ICON_NAME, SLOT_RANK, SLOT_TIME_ORDER } from './mealSlots'

describe('meal slot ordering', () => {
  it('lists slots by time of day: déjeuner → dîner → collation → souper', () => {
    expect(SLOT_TIME_ORDER).toEqual(['breakfast', 'lunch', 'snack', 'supper'])
  })

  it('ranks slots strictly increasing in time order (snack before supper)', () => {
    expect(SLOT_RANK.breakfast).toBeLessThan(SLOT_RANK.lunch)
    expect(SLOT_RANK.lunch).toBeLessThan(SLOT_RANK.snack)
    expect(SLOT_RANK.snack).toBeLessThan(SLOT_RANK.supper)
  })

  it('side slots are every slot but supper, in time order', () => {
    expect(SIDE_SLOTS).toEqual(['breakfast', 'lunch', 'snack'])
  })

  it('has a distinct food icon for every slot (no slot falls back to a generic glyph)', () => {
    for (const s of MEAL_SLOTS) expect(SLOT_ICON_NAME[s]).toBeTruthy()
    const icons = MEAL_SLOTS.map((s) => SLOT_ICON_NAME[s])
    expect(new Set(icons).size).toBe(MEAL_SLOTS.length) // all four are different
    expect(icons).not.toContain('carrot-bold') // a meal is never the carrot
  })
})
