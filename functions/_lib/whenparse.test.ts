import { describe, it, expect } from 'vitest'
import { parseWhen } from './whenparse'

// Fixed "now": Wednesday 2026-06-03 12:00 UTC. Deterministic so weekday math is
// stable regardless of when the test runs.
const NOW = Date.UTC(2026, 5, 3, 12, 0, 0)

describe('parseWhen', () => {
  it('falls back to today/all-day on empty input', () => {
    const r = parseWhen(undefined, NOW)
    expect(r.allDay).toBe(true)
  })

  it('reads a weekday + 24h time', () => {
    const r = parseWhen('mardi 15h', NOW)
    expect(r.allDay).toBe(false)
    const d = new Date(r.startAt * 1000)
    expect(d.getUTCDay()).toBe(2) // Tuesday
    expect(d.getUTCHours()).toBe(15)
  })

  it('reads "demain"', () => {
    const r = parseWhen('demain', NOW)
    const d = new Date(r.startAt * 1000)
    expect(d.getUTCDate()).toBe(4) // 3rd + 1
  })

  it('reads am/pm', () => {
    const r = parseWhen('thursday 3pm', NOW)
    const d = new Date(r.startAt * 1000)
    expect(d.getUTCDay()).toBe(4)
    expect(d.getUTCHours()).toBe(15)
  })

  it('same-weekday means next week, not today', () => {
    // NOW is Wednesday; "mercredi" should land 7 days out, not now.
    const r = parseWhen('mercredi 9h', NOW)
    const d = new Date(r.startAt * 1000)
    expect(d.getUTCDate()).toBe(10)
  })
})
