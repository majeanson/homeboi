import { describe, it, expect } from 'vitest'
import { presetWhen, dateStr, hhmm } from './ScheduleFields'

// The « Plus tard » quick presets — pure (now injectable), so the date math is unit-tested
// rather than eyeballed against a live clock.
describe('presetWhen (schedule presets)', () => {
  it('« ce soir » is today 19:00 before 19 h', () => {
    const now = new Date(2026, 5, 30, 10, 0) // Tue 30 Jun 2026, 10:00 local
    expect(presetWhen('tonight', now)).toEqual({ date: dateStr(now), time: '19:00' })
  })

  it('« ce soir » rolls to tomorrow once it is already past 19 h', () => {
    const now = new Date(2026, 5, 30, 21, 0) // 21:00 — tonight is behind us
    const tomorrow = new Date(2026, 5, 31, 21, 0)
    expect(presetWhen('tonight', now)).toEqual({ date: dateStr(tomorrow), time: '19:00' })
  })

  it('« demain matin » is tomorrow 08:00', () => {
    const now = new Date(2026, 5, 30, 10, 0)
    const tomorrow = new Date(2026, 5, 31, 10, 0)
    expect(presetWhen('tomorrowAm', now)).toEqual({ date: dateStr(tomorrow), time: '08:00' })
  })

  it('« ce week-end » lands on the next Saturday at 09:00', () => {
    const now = new Date(2026, 5, 30, 10, 0) // Tuesday
    const r = presetWhen('weekend', now)
    expect(r.time).toBe('09:00')
    // The resolved date parses back to a Saturday (getDay() === 6).
    expect(new Date(`${r.date}T09:00`).getDay()).toBe(6)
  })

  it('hhmm zero-pads the local time', () => {
    expect(hhmm(new Date(2026, 0, 1, 8, 5))).toBe('08:05')
  })
})
