import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HERO,
  DEFAULT_SLOT_HOURS,
  DEFAULT_SLOT_ORDER,
  MEAL_SLOTS,
  SLOT_ICON_NAME,
  clockOrder,
  formatSlotHour,
  rankFrom,
  slotAtMinute,
  type MealSlot,
} from './mealSlots'

const h = (hour: number, min = 0) => hour * 60 + min

describe('meal slot defaults', () => {
  it('lists slots by time of day out of the box: déjeuner → dîner → collation → souper → dessert', () => {
    expect(DEFAULT_SLOT_ORDER).toEqual(['breakfast', 'lunch', 'snack', 'supper', 'dessert'])
  })

  it('makes the souper the day’s hero out of the box', () => {
    expect(DEFAULT_HERO).toBe('supper')
  })

  it('covers every slot with a start hour, strictly increasing through the day', () => {
    for (const s of MEAL_SLOTS) expect(DEFAULT_SLOT_HOURS[s]).toBeTypeOf('number')
    const inOrder = DEFAULT_SLOT_ORDER.map((s) => DEFAULT_SLOT_HOURS[s])
    for (let i = 1; i < inOrder.length; i++) expect(inOrder[i]).toBeGreaterThan(inOrder[i - 1])
  })

  it('has a distinct food icon for every slot (no slot falls back to a generic glyph)', () => {
    for (const s of MEAL_SLOTS) expect(SLOT_ICON_NAME[s]).toBeTruthy()
    const icons = MEAL_SLOTS.map((s) => SLOT_ICON_NAME[s])
    expect(new Set(icons).size).toBe(MEAL_SLOTS.length) // all five are different
    expect(icons).not.toContain('carrot-bold') // a meal is never the carrot
  })
})

describe('rankFrom — sorting by the household display order', () => {
  it('ranks slots by their index in the given order', () => {
    const rank = rankFrom(['supper', 'breakfast', 'lunch', 'snack', 'dessert'])
    expect(rank('supper')).toBeLessThan(rank('breakfast'))
    expect(rank('breakfast')).toBeLessThan(rank('lunch'))
  })

  it('parks an unknown slot after the known five', () => {
    const rank = rankFrom(DEFAULT_SLOT_ORDER)
    expect(rank('brunch')).toBeGreaterThan(rank('dessert'))
  })
})

describe('clockOrder — the wall clock, never the display order', () => {
  it('sorts by start time regardless of how the household reordered the list', () => {
    // The order array is irrelevant here — only `hours` decides.
    expect(clockOrder(DEFAULT_SLOT_HOURS)).toEqual(['breakfast', 'lunch', 'snack', 'supper', 'dessert'])
  })

  it('follows an edited hour', () => {
    // A household that snacks after supper.
    const late: Record<MealSlot, number> = { ...DEFAULT_SLOT_HOURS, snack: h(18) }
    expect(clockOrder(late)).toEqual(['breakfast', 'lunch', 'supper', 'snack', 'dessert'])
  })

  it('breaks a tie deterministically by the built-in order', () => {
    const tied: Record<MealSlot, number> = { ...DEFAULT_SLOT_HOURS, snack: DEFAULT_SLOT_HOURS.supper }
    expect(clockOrder(tied)).toEqual(['breakfast', 'lunch', 'snack', 'supper', 'dessert'])
  })
})

describe('slotAtMinute — the meal you are cooking or heading toward', () => {
  it('picks the first meal that is not over yet', () => {
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(8))).toBe('breakfast') // 07:00 + grace
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(12))).toBe('lunch')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(15))).toBe('snack')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(18))).toBe('supper')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(21))).toBe('dessert')
  })

  it('moves on to the next meal once the grace window closes', () => {
    // The 07:00 déjeuner is "over" 90 min later — at 08:31 you're heading to the dîner.
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(8, 29))).toBe('breakfast')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(8, 31))).toBe('lunch')
  })

  it('clamps the small hours to the day’s FIRST meal, never wrapping to the last', () => {
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, 0)).toBe('breakfast')
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(5, 59))).toBe('breakfast')
  })

  it('clamps the late night to the day’s LAST meal', () => {
    expect(slotAtMinute(DEFAULT_SLOT_HOURS, h(23, 59))).toBe('dessert')
  })
})

describe('formatSlotHour', () => {
  it('reads as a Québec wall clock in FR', () => {
    expect(formatSlotHour(h(16), 'fr')).toBe('16 h')
    expect(formatSlotHour(h(17, 30), 'fr')).toBe('17 h 30')
  })

  it('reads as a 12-hour clock in EN', () => {
    expect(formatSlotHour(h(16), 'en')).toBe('4 PM')
    expect(formatSlotHour(h(17, 30), 'en')).toBe('5:30 PM')
    expect(formatSlotHour(h(0), 'en')).toBe('12 AM')
    expect(formatSlotHour(h(12), 'en')).toBe('12 PM')
  })
})
