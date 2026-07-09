import { describe, it, expect } from 'vitest'
import { isPastSec, mealSlotPast, SLOT_PAST_MIN } from './itemLife'

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

    it('strikes a slot once past its end-of-window minute', () => {
      expect(mealSlotPast('breakfast', at(11, 0))).toBe(true) // cut 10:30
      expect(mealSlotPast('lunch', at(11, 0))).toBe(false) // cut 14:00
    })
    it('does not strike before the threshold', () => {
      expect(mealSlotPast('breakfast', at(9, 0))).toBe(false)
    })
    it('never strikes SOUPER — the evening headline is not in the table', () => {
      expect(SLOT_PAST_MIN.supper).toBeUndefined()
      expect(mealSlotPast('supper', at(23, 0))).toBe(false)
    })
    it('never strikes an unknown slot', () => {
      expect(mealSlotPast('brunch', at(23, 0))).toBe(false)
    })
  })
})
