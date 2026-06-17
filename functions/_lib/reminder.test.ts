import { describe, it, expect } from 'vitest'
import { isSoon } from './reminder'

// The calm "Bientôt" window: now ∈ [at − lead, at). Event at t=1000.
describe('isSoon', () => {
  const AT = 1000
  const LEAD = 100 // window opens at 900

  it('is false with no lead set (null/undefined)', () => {
    expect(isSoon(950, AT, null)).toBe(false)
    expect(isSoon(950, AT, undefined)).toBe(false)
  })
  it('is false before the window opens', () => {
    expect(isSoon(899, AT, LEAD)).toBe(false)
  })
  it('is true inside the window (open at start, up to but not including the moment)', () => {
    expect(isSoon(900, AT, LEAD)).toBe(true) // exactly when it opens
    expect(isSoon(999, AT, LEAD)).toBe(true) // a second before
  })
  it('is false once the occurrence is here or past (no longer "soon")', () => {
    expect(isSoon(1000, AT, LEAD)).toBe(false) // the moment itself
    expect(isSoon(1200, AT, LEAD)).toBe(false) // after
  })
})
