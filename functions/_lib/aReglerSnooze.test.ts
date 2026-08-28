import { describe, it, expect } from 'vitest'
import { cleanSnoozeDays, snoozeUntil, withoutSnoozed, SNOOZE_DAYS_DEFAULT, SNOOZE_DAYS_MAX } from './aReglerSnooze'
import { localDayStart } from './ids'

describe('cleanSnoozeDays', () => {
  it('defaults to one day when nothing usable is sent', () => {
    for (const bad of [undefined, null, 'soon', NaN, {}, []]) {
      expect(cleanSnoozeDays(bad)).toBe(SNOOZE_DAYS_DEFAULT)
    }
  })
  it('clamps to at least a day — a zero-day snooze would be a no-op that LOOKS like one', () => {
    expect(cleanSnoozeDays(0)).toBe(1)
    expect(cleanSnoozeDays(-99)).toBe(1)
  })
  it('caps the ceiling, so a crafted body cannot mute a household for years', () => {
    expect(cleanSnoozeDays(9999)).toBe(SNOOZE_DAYS_MAX)
  })
  it('rounds a fractional day rather than storing one', () => {
    expect(cleanSnoozeDays(2.4)).toBe(2)
    expect(cleanSnoozeDays(2.6)).toBe(3)
  })
})

describe('snoozeUntil', () => {
  it('is a LOCAL midnight, so the signal returns at the start of its day', () => {
    const today = localDayStart(new Date('2026-08-27T18:00:00Z'))
    const until = snoozeUntil(today, 1)
    expect(until).toBe(localDayStart(new Date(until * 1000)))
    expect(until).toBeGreaterThan(today)
  })
  it('crosses a DST boundary without drifting off midnight (the fixed-86400 trap)', () => {
    // 2026-11-01 is the North-American fall-back; a naive today+86400 lands at 23:00
    // the previous day, which would wake the signal a day early.
    const today = localDayStart(new Date('2026-10-31T12:00:00Z'))
    const until = snoozeUntil(today, 1)
    expect(until).toBe(localDayStart(new Date(until * 1000)))
  })
})

describe('withoutSnoozed', () => {
  const signals = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
  it('drops exactly the quieted keys', () => {
    expect(withoutSnoozed(signals, new Set(['b'])).map((s) => s.key)).toEqual(['a', 'c'])
  })
  it('is identity when nothing is quiet (and returns the SAME array — no needless copy)', () => {
    expect(withoutSnoozed(signals, new Set())).toBe(signals)
  })
  it('ignores a stale key for a signal that no longer exists', () => {
    expect(withoutSnoozed(signals, new Set(['gone'])).map((s) => s.key)).toEqual(['a', 'b', 'c'])
  })
})
