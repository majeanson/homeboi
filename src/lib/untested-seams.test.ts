import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capitalize, formatAgo, formatDayMaybeYear, formatPastDay, formatTime } from './format'
import { spliceListLine } from './listAdd'
import { BOARD_KEY } from './queryKeys'
import { SEARCH_INDEX } from './searchIndex'

// Seams that many screens lean on and no test had ever imported (solidify 7.1, 2026-11-05).
// Each case states a promise a screen makes, not the code's shape.

describe('format', () => {
  const noon = Math.floor(new Date(2026, 5, 15, 12, 0).getTime() / 1000)

  it('capitalize leaves an empty string alone', () => {
    expect(capitalize('')).toBe('')
    expect(capitalize('lundi')).toBe('Lundi')
  })
  it('a time reads the Québec way in French, the English way in English', () => {
    expect(formatTime(noon, 'fr')).toMatch(/^12\s*h\s*00$/)
    expect(formatTime(noon, 'en')).toMatch(/12:00/)
  })
  it('« il y a » never goes negative on a clock that runs ahead', () => {
    const now = noon * 1000
    expect(formatAgo(noon + 3600, 'fr', now)).not.toMatch(/-/)
  })
  it('a near date stays terse, a far future one says its year', () => {
    const now = noon * 1000
    expect(formatDayMaybeYear(noon + 30 * 86_400, 'fr', now)).not.toContain('2026')
    expect(formatDayMaybeYear(noon + 400 * 86_400, 'fr', now)).toMatch(/2027/)
  })
  it('a past day never reads as a future one', () => {
    const now = noon * 1000
    expect(formatPastDay(noon - 2 * 86_400, 'fr', now)).not.toMatch(/dans/i)
  })
})

describe('spliceListLine', () => {
  const qc = new QueryClient()
  beforeEach(() => qc.clear())

  it('a new line lands above the trailing « pas pressé » block', () => {
    qc.setQueryData(BOARD_KEY, {
      list: [
        { id: 'a', text: 'Lait', checked_at: null, non_urgent: 0 },
        { id: 'z', text: 'Un jour', checked_at: null, non_urgent: 1 },
      ],
    })
    spliceListLine(qc, 'tmp-1', 'Pain')
    const { list } = qc.getQueryData<{ list: { id: string }[] }>(BOARD_KEY)!
    expect(list.map((l) => l.id)).toEqual(['a', 'tmp-1', 'z'])
  })
  it('with no board in the cache it does nothing, and does not invent one', () => {
    spliceListLine(qc, 'tmp-1', 'Pain')
    expect(qc.getQueryData(BOARD_KEY)).toBeUndefined()
  })
})

describe('searchable means it has an entry', () => {
  it('a recipe is found by name first, then by what is in it', () => {
    const r = { title: 'Pâté chinois', ingredients: ['maïs'], tags: ['souper'] }
    expect(SEARCH_INDEX.recipe.primary(r)).toBe('Pâté chinois')
    expect(SEARCH_INDEX.recipe.secondary?.(r)).toContain('maïs')
    expect(SEARCH_INDEX.recipe.secondary?.(r)).toContain('souper')
  })
  it('a recipe with no lists still answers', () => {
    expect(SEARCH_INDEX.recipe.secondary?.({ title: 'Vide' }).trim()).toBe('')
  })
})

describe('the day-part drift', () => {
  it('an opted-out device is left alone, and a later opt-in is picked up on the next tick', async () => {
    vi.useFakeTimers()
    try {
      const theme = await import('./theme')
      const spy = vi.spyOn(theme, 'isDaypartAuto').mockReturnValue(false)
      const { startDaypartDrift } = await import('./daypartDrift')
      document.documentElement.removeAttribute('data-daypart')
      const stop = startDaypartDrift()
      expect(document.documentElement.getAttribute('data-daypart')).toBeNull()
      spy.mockReturnValue(true)
      vi.advanceTimersByTime(10 * 60 * 1000)
      expect(document.documentElement.getAttribute('data-daypart')).not.toBeNull()
      stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
