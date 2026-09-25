import { describe, it, expect } from 'vitest'
import { presetWhen, birthdayWhen, dateStr, hhmm } from './ScheduleFields'

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

describe('birthdayWhen (« Sa fête » — A8)', () => {
  // A Tuesday in March, 10:00 local.
  const now = new Date(2026, 2, 10, 10, 0)

  it('a birthday still ahead this year lands on that day at 08:00', () => {
    expect(birthdayWhen('1988-06-15', now)).toEqual({ date: '2026-06-15', time: '08:00' })
  })
  it('a birthday already behind us this year is next year\'s', () => {
    // Red against `d < now` never rolling: it would schedule into the past.
    expect(birthdayWhen('1988-02-01', now)).toEqual({ date: '2027-02-01', time: '08:00' })
  })
  it('the day itself is "next" until 08:00 has passed', () => {
    expect(birthdayWhen('1988-03-10', new Date(2026, 2, 10, 7, 30))).toEqual({ date: '2026-03-10', time: '08:00' })
    expect(birthdayWhen('1988-03-10', now)).toEqual({ date: '2027-03-10', time: '08:00' })
  })
  it('an unknown year (0000-MM-DD, the cercle\'s spelling) reads the same', () => {
    expect(birthdayWhen('0000-06-15', now)).toEqual({ date: '2026-06-15', time: '08:00' })
  })
  it('Feb 29 on a non-leap year overflows to Mar 1 rather than vanishing', () => {
    expect(birthdayWhen('2004-02-29', now)).toEqual({ date: '2027-03-01', time: '08:00' })
  })
  it('nothing readable → null, so the preset hides', () => {
    expect(birthdayWhen(null, now)).toBeNull()
    expect(birthdayWhen('', now)).toBeNull()
    expect(birthdayWhen('15/06/1988', now)).toBeNull()
    expect(birthdayWhen('1988-13-01', now)).toBeNull()
  })
})
