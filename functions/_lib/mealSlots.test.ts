import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HERO,
  DEFAULT_SLOT_HOURS,
  DEFAULT_SLOT_ORDER,
  cleanColors,
  cleanHero,
  cleanHidden,
  cleanHours,
  cleanOrder,
  mealOrderSql,
  slotCaseSql,
  type Slot,
} from './mealSlots'

describe('cleanColors', () => {
  it('keeps valid {slot: hex} pairs, lower-cased', () => {
    expect(cleanColors({ supper: '#AABBCC' })).toEqual({ supper: '#aabbcc' })
  })
  it('drops unknown slots and malformed hex', () => {
    expect(cleanColors({ brunch: '#aabbcc', supper: 'red', lunch: '#abc' })).toEqual({})
  })
  it('survives a non-object', () => {
    expect(cleanColors(null)).toEqual({})
    expect(cleanColors(['#aabbcc'])).toEqual({})
  })
})

describe('cleanHidden', () => {
  it('keeps known slots, de-duped', () => {
    expect(cleanHidden(['supper', 'supper', 'brunch'])).toEqual(['supper'])
  })
  it('survives a non-array', () => {
    expect(cleanHidden('supper')).toEqual([])
  })
})

describe('cleanOrder', () => {
  it('honours the given order', () => {
    expect(cleanOrder(['supper', 'breakfast', 'lunch', 'snack', 'dessert'])).toEqual([
      'supper',
      'breakfast',
      'lunch',
      'snack',
      'dessert',
    ])
  })

  it('always returns ALL five slots — a short list gets the rest appended', () => {
    // The critical invariant: a stale client PATCHing a 2-slot order must never make
    // the other three vanish from the kitchen.
    expect(cleanOrder(['dessert', 'supper'])).toEqual(['dessert', 'supper', 'breakfast', 'lunch', 'snack'])
  })

  it('drops unknown slots and duplicates', () => {
    expect(cleanOrder(['brunch', 'supper', 'supper', 42])).toEqual([
      'supper',
      'breakfast',
      'lunch',
      'snack',
      'dessert',
    ])
  })

  it('falls back to the default order on junk', () => {
    expect(cleanOrder(null)).toEqual(DEFAULT_SLOT_ORDER)
    expect(cleanOrder('supper')).toEqual(DEFAULT_SLOT_ORDER)
  })
})

describe('cleanHero', () => {
  it('accepts a known slot', () => {
    expect(cleanHero('lunch')).toBe('lunch')
  })
  it('falls back to the souper on anything else', () => {
    expect(cleanHero('brunch')).toBe(DEFAULT_HERO)
    expect(cleanHero(undefined)).toBe(DEFAULT_HERO)
  })
})

describe('cleanHours', () => {
  it('accepts a partial map, defaulting the rest', () => {
    expect(cleanHours({ supper: 19 * 60 })).toEqual({ ...DEFAULT_SLOT_HOURS, supper: 19 * 60 })
  })

  it('drops out-of-range, non-integer and unknown-slot values rather than clamping', () => {
    // Clamping a bad value to a boundary would silently reorder the day.
    expect(cleanHours({ supper: -1, lunch: 1440, snack: 12.5, brunch: 600 })).toEqual(DEFAULT_SLOT_HOURS)
  })

  it('accepts the edges of the day', () => {
    expect(cleanHours({ breakfast: 0 }).breakfast).toBe(0)
    expect(cleanHours({ dessert: 1439 }).dessert).toBe(1439)
  })

  it('survives junk', () => {
    expect(cleanHours(null)).toEqual(DEFAULT_SLOT_HOURS)
    expect(cleanHours([1, 2])).toEqual(DEFAULT_SLOT_HOURS)
  })
})

describe('slotCaseSql', () => {
  it('ranks the slots in the given order', () => {
    expect(slotCaseSql(['supper', 'breakfast', 'lunch', 'snack', 'dessert'])).toBe(
      "CASE slot WHEN 'supper' THEN 0 WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'snack' THEN 3 WHEN 'dessert' THEN 4 ELSE 9 END",
    )
  })

  it('parks an unknown/legacy slot after the known five', () => {
    expect(slotCaseSql(DEFAULT_SLOT_ORDER)).toContain('ELSE 9')
  })

  it('REFUSES to interpolate anything not on the allowlist', () => {
    // The one place a household value reaches raw SQL — cleanOrder already guards it,
    // but the builder must not be a second injection door if a caller forgets.
    expect(() => slotCaseSql(["x' OR '1'='1" as unknown as Slot])).toThrow(/unknown slot/)
  })

  it('emits no quote that could escape the literal', () => {
    const sql = slotCaseSql(DEFAULT_SLOT_ORDER)
    expect(sql.match(/'/g)?.length).toBe(10) // exactly two per slot, five slots
  })
})

describe('mealOrderSql', () => {
  it('tie-breaks on position then created_at then id, after the slot rank', () => {
    expect(mealOrderSql(DEFAULT_SLOT_ORDER)).toBe(`${slotCaseSql(DEFAULT_SLOT_ORDER)}, position, created_at, id`)
  })
})
