import { describe, it, expect } from 'vitest'
import { canEmptyFridge, togglePick, MAX_FRIDGE_PICKS } from './emptyFridge'

describe('canEmptyFridge', () => {
  it('needs AI on AND at least one thing to use up', () => {
    expect(canEmptyFridge(true, 2, 0)).toBe(true)
    expect(canEmptyFridge(true, 0, 1)).toBe(true) // réserve alone is enough
    expect(canEmptyFridge(true, 0, 0)).toBe(false) // nothing to rescue
    expect(canEmptyFridge(false, 5, 5)).toBe(false) // AI off → no tile
  })
})

describe('togglePick', () => {
  it('adds and removes a title', () => {
    const a = togglePick(new Set(), 'frittata')
    expect([...a]).toEqual(['frittata'])
    const b = togglePick(a, 'frittata')
    expect(b.size).toBe(0)
  })

  it('caps new picks at the max but always allows un-ticking', () => {
    let s = new Set<string>()
    for (const d of ['a', 'b', 'c', 'd', 'e']) s = togglePick(s, d)
    expect(s.size).toBe(MAX_FRIDGE_PICKS) // 4th + 5th refused
    expect([...s]).toEqual(['a', 'b', 'c'])
    // Un-ticking one frees a slot for a new pick.
    s = togglePick(s, 'a')
    s = togglePick(s, 'd')
    expect(s.has('d')).toBe(true)
    expect(s.has('a')).toBe(false)
  })

  it('returns a new set (no mutation of the input)', () => {
    const orig = new Set(['x'])
    const next = togglePick(orig, 'y')
    expect([...orig]).toEqual(['x'])
    expect(next).not.toBe(orig)
  })
})
