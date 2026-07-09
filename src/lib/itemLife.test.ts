import { describe, it, expect } from 'vitest'
import { isPastSec, mealSlotPast } from './itemLife'
import { DEFAULT_SLOT_HOURS } from './mealSlots'

// The shared board lifecycle rule — one "is this timed thing past?" predicate so meals,
// rendez-vous and work all cross out on the same clock.
describe('itemLife', () => {
  describe('isPastSec', () => {
    const now = 1_000_000 * 1000 // an arbitrary nowMs

    it('is past once the anchor second is behind now', () => {
      expect(isPastSec(999_999, now)).toBe(true) // anchor*1000 < now
    })
    it('is not past for a future anchor', () => {
      expect(isPastSec(1_000_001, now)).toBe(false)
    })
    it('treats null / undefined (untimed / all-day) as never past', () => {
      expect(isPastSec(null, now)).toBe(false)
      expect(isPastSec(undefined, now)).toBe(false)
    })
  })

  describe('mealSlotPast', () => {
    // mealSlotPast reads the America/Toronto wall clock (localDay.ts), not the runner's
    // own zone — so build each instant as UTC annotated with its known Toronto offset
    // (EDT = UTC-4 in July; no DST edge) rather than a machine-local Date constructor,
    // so this test is deterministic on any CI runner regardless of its timezone.
    const at = (h: number, m = 0) => Date.UTC(2024, 6, 1, h + 4, m)

    // Defaults: déjeuner 07:00, dîner 12:00, collation 15:00, souper 17:30, dessert 20:00.
    // A meal's window closes SLOT_GRACE_MIN (90) after it's served.
    it('strikes a slot once its serve window has closed', () => {
      expect(mealSlotPast('breakfast', at(8, 31))).toBe(true) // served 07:00, closed 08:30
      expect(mealSlotPast('lunch', at(11, 0))).toBe(false) // not even served yet
      expect(mealSlotPast('lunch', at(13, 31))).toBe(true) // served 12:00, closed 13:30
    })
    it('does not strike before the threshold', () => {
      expect(mealSlotPast('breakfast', at(8, 29))).toBe(false)
    })
    it('never strikes the HERO — the day’s headline is never line-crossed', () => {
      expect(mealSlotPast('supper', at(23, 0))).toBe(false)
    })
    it('never strikes a meal served AFTER the hero — it stays live all evening', () => {
      expect(mealSlotPast('dessert', at(23, 0))).toBe(false)
    })
    it('never strikes an unknown slot', () => {
      expect(mealSlotPast('brunch', at(23, 0))).toBe(false)
    })

    // The whole point of deriving from `hours`: the old fixed table (dîner cut 14:00)
    // struck a dîner served at 15:00 through at 14:01, an hour before it happened.
    it('follows the household’s own serve hours', () => {
      const late = { ...DEFAULT_SLOT_HOURS, lunch: 15 * 60 }
      expect(mealSlotPast('lunch', at(14, 1), late)).toBe(false) // not served yet!
      expect(mealSlotPast('lunch', at(16, 31), late)).toBe(true) // served 15:00, closed 16:30
    })

    // Moving a meal PAST the hero on the clock makes it an after-the-hero meal — it
    // stops striking, exactly like the dessert. (The old fixed table struck a collation
    // served at 18:00 at 17:01, before it had even happened.)
    it('a meal moved after the hero stops striking, like the dessert', () => {
      const evening = { ...DEFAULT_SLOT_HOURS, snack: 18 * 60 } // after the 17:30 souper
      expect(mealSlotPast('snack', at(17, 1), evening)).toBe(false)
      expect(mealSlotPast('snack', at(23, 0), evening)).toBe(false)
    })

    it('follows the household’s hero pick — a promoted dîner never strikes', () => {
      expect(mealSlotPast('lunch', at(23, 0), DEFAULT_SLOT_HOURS, 'lunch')).toBe(false)
      // …and the souper, now AFTER the hero on the clock, stops striking too.
      expect(mealSlotPast('supper', at(23, 0), DEFAULT_SLOT_HOURS, 'lunch')).toBe(false)
      // …while the déjeuner, still before it, strikes as usual.
      expect(mealSlotPast('breakfast', at(9, 0), DEFAULT_SLOT_HOURS, 'lunch')).toBe(true)
    })
  })
})
