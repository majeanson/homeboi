import { describe, it, expect } from 'vitest'
import { noRushStart, rushRank, type NoRushRow } from './listOrder'

const errand: NoRushRow = { non_urgent: null }
const noRush: NoRushRow = { non_urgent: 1 }

describe('« pas pressé » ordering', () => {
  it('sorts errands before « pas pressé » lines', () => {
    expect(rushRank(errand)).toBeLessThan(rushRank(noRush))
    expect(rushRank({})).toBe(0)
  })

  it('lands a new line at the end when nothing is flagged', () => {
    expect(noRushStart([errand, errand])).toBe(2)
    expect(noRushStart([])).toBe(0)
  })

  it('lands a new line ABOVE the trailing « pas pressé » block', () => {
    expect(noRushStart([errand, errand, noRush, noRush])).toBe(2)
    expect(noRushStart([noRush, noRush])).toBe(0)
  })

  it('leaves a flagged line a shopper dragged up into the errands alone', () => {
    // Only the TRAILING run counts: the mid-list flag keeps its hand-dragged slot.
    expect(noRushStart([errand, noRush, errand])).toBe(3)
    expect(noRushStart([errand, noRush, errand, noRush])).toBe(3)
  })
})
