import { describe, it, expect } from 'vitest'
import { ideasForDay } from './mealIdeas'

const DAY = 1_749_355_200 // an arbitrary local-midnight day-seconds anchor
const OTHER_DAY = DAY + 86400

describe('ideasForDay', () => {
  it('matches an idea suggested by someone FOR the given day', () => {
    const ideas = [{ id: 'a', suggested_by: 'm3', date: DAY }]
    expect(ideasForDay(ideas, DAY)).toEqual(ideas)
  })

  it('excludes an idea dated for a DIFFERENT day', () => {
    const ideas = [{ id: 'a', suggested_by: 'm3', date: OTHER_DAY }]
    expect(ideasForDay(ideas, DAY)).toEqual([])
  })

  it('excludes a plain undated pool idea, even with the same suggested_by', () => {
    const ideas = [
      { id: 'a', suggested_by: 'm3', date: null },
      { id: 'b', suggested_by: 'm3', date: undefined },
    ]
    expect(ideasForDay(ideas, DAY)).toEqual([])
  })

  it('excludes a dated idea with no suggested_by (a plain idea someone dated)', () => {
    const ideas = [{ id: 'a', suggested_by: null, date: DAY }]
    expect(ideasForDay(ideas, DAY)).toEqual([])
  })

  it('returns every matching idea, not just the first', () => {
    const ideas = [
      { id: 'a', suggested_by: 'm3', date: DAY },
      { id: 'b', suggested_by: 'm4', date: DAY },
      { id: 'c', suggested_by: 'm3', date: OTHER_DAY },
    ]
    expect(ideasForDay(ideas, DAY).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('is a pure filter — never mutates the input array', () => {
    const ideas = [{ id: 'a', suggested_by: 'm3', date: DAY }]
    const copy = [...ideas]
    ideasForDay(ideas, DAY)
    expect(ideas).toEqual(copy)
  })
})
