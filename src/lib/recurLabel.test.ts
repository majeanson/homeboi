import { describe, it, expect } from 'vitest'
import { recurOf, recurLabel } from './recurLabel'
import { FR, EN } from '../i18n'

describe('recurOf', () => {
  it('parses a stored weekly rule', () => {
    expect(recurOf('{"freq":"weekly","interval":1,"weekdays":[4]}')).toEqual({
      freq: 'weekly',
      interval: 1,
      weekdays: [4],
    })
  })
  it('returns null for empty / malformed / non-rule', () => {
    expect(recurOf(null)).toBeNull()
    expect(recurOf('')).toBeNull()
    expect(recurOf('not json')).toBeNull()
    expect(recurOf('{"freq":"yearly"}')).toBeNull()
  })
  it('defaults a missing interval/weekdays', () => {
    expect(recurOf('{"freq":"daily"}')).toEqual({ freq: 'daily', interval: 1, weekdays: [] })
  })
})

describe('recurLabel', () => {
  it('is empty for no rule', () => {
    expect(recurLabel(null, FR)).toBe('')
  })
  it('labels weekly-on-Thursday with the weekday', () => {
    const label = recurLabel('{"freq":"weekly","interval":1,"weekdays":[4]}', FR)
    expect(label).toContain(FR.recur.weekly)
    expect(label).toContain(FR.recur.weekdayShort[4])
  })
  it('labels a plain daily rule', () => {
    expect(recurLabel('{"freq":"daily","interval":1,"weekdays":[]}', EN)).toBe(EN.recur.daily)
  })
  it('labels an every-N interval', () => {
    const label = recurLabel('{"freq":"weekly","interval":2,"weekdays":[]}', EN)
    expect(label).toContain('2')
  })
})
