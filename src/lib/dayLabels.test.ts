import { describe, expect, it } from 'vitest'
import { dayChipLabel } from './format'
import { spanWindow } from './car'
import { pickTab } from './tabParam'
import { BOARD_VIEWS, BOARD_VIEW_ALIASES, DEFAULT_BOARD_VIEW } from './boardview'
import { addLocalDays, todayLocalDay } from './localDay'

// Review #12 (2026-11-17), Mélanie: three small lies about WHEN.

describe('a day chip says which day, past a week', () => {
  // A ten-day meal window used to read « mardi … lundi mardi mercredi jeudi ».
  it('today, tomorrow, then a short weekday with its date; no two chips alike', () => {
    const now = Date.now()
    const today = todayLocalDay()
    const labels = Array.from({ length: 10 }, (_, i) => dayChipLabel(addLocalDays(today, i), 'fr', 'Aujourd’hui', 'Demain', now))
    expect(labels.slice(0, 2)).toEqual(['Aujourd’hui', 'Demain'])
    expect(labels[2]).toMatch(/^\p{Lu}\p{L}+ \d{1,2}$/u)
    expect(new Set(labels).size).toBe(10)
  })
})

describe('a car span that covers the whole day says so', () => {
  const day = todayLocalDay()
  const next = addLocalDays(day, 1)
  const hhmm = (at: number) => `t${at - day}`
  it('an all-day rendez-vous is « Toute la journée », never « 0 h 00–0 h 00 »', () => {
    expect(spanWindow({ start: day, end: next }, day, next, hhmm, 'Toute la journée')).toBe('Toute la journée')
  })
  it('a window inside the day keeps its hours', () => {
    expect(spanWindow({ start: day + 3600, end: day + 7200 }, day, next, hhmm, 'Toute la journée')).toBe('t3600–t7200')
  })
})

describe('a board link may name a view by its other word', () => {
  const pick = (raw: string | null) => pickTab(raw, DEFAULT_BOARD_VIEW, BOARD_VIEWS, BOARD_VIEW_ALIASES)
  it('?view=week opens « La semaine » (it used to land on the grid)', () => {
    expect(pick('week')).toBe('semaine')
    expect(pick('Week')).toBe('semaine')
    expect(pick('year')).toBe('annee')
  })
  it('the canonical names still win, and nonsense still falls back', () => {
    expect(pick('semaine')).toBe('semaine')
    expect(pick('nope')).toBe(DEFAULT_BOARD_VIEW)
    expect(pick(null)).toBe(DEFAULT_BOARD_VIEW)
  })
  it('every alias points at a real view', () => {
    for (const v of Object.values(BOARD_VIEW_ALIASES)) expect(BOARD_VIEWS).toContain(v)
  })
})
