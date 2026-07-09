import { describe, it, expect } from 'vitest'
import { guestRowAcceptable } from './household'

// D-18 (bmad/10) — the guest-row acceptance table. Legacy/short-TTL tokens stay
// row-optional (unchanged since §509); a STANDING token flips to row-required,
// since its 10-year backstop expiry means the row is the only real kill switch.
describe('guestRowAcceptable', () => {
  it('legacy (non-standing): no row → accepted (still honoured until its own TTL)', () => {
    expect(guestRowAcceptable(false, null)).toBe(true)
  })

  it('legacy (non-standing): row present, not revoked → accepted', () => {
    expect(guestRowAcceptable(false, { revoked_at: null })).toBe(true)
  })

  it('legacy (non-standing): row present, revoked → rejected', () => {
    expect(guestRowAcceptable(false, { revoked_at: 12345 })).toBe(false)
  })

  it('standing: no row → rejected (never hand out an unkillable token)', () => {
    expect(guestRowAcceptable(true, null)).toBe(false)
  })

  it('standing: row present, not revoked → accepted', () => {
    expect(guestRowAcceptable(true, { revoked_at: null })).toBe(true)
  })

  it('standing: row present, revoked → rejected', () => {
    expect(guestRowAcceptable(true, { revoked_at: 12345 })).toBe(false)
  })
})
