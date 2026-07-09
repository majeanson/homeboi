import { describe, it, expect } from 'vitest'
import { togglePick, MAX_FRIDGE_PICKS } from './emptyFridge'

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
