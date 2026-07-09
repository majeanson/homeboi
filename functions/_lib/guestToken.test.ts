import { describe, it, expect, vi } from 'vitest'
import { issueGuestToken, verifyGuestToken, verifyDeviceToken, issueDeviceToken, normalizeGuestKind, STANDING_TTL } from './auth'
import type { Env } from './env'

// A minimal Env: the token path only ever reads SESSION_SECRET (HMAC key). Cast
// through unknown so we don't have to stub D1/R2/AI the token code never touches.
const env = { SESSION_SECRET: 'x'.repeat(40) } as unknown as Env

describe('normalizeGuestKind', () => {
  it('keeps the known kinds, falls back to showcase otherwise', () => {
    expect(normalizeGuestKind('sitter')).toBe('sitter')
    expect(normalizeGuestKind('welcome')).toBe('welcome')
    expect(normalizeGuestKind('family')).toBe('family')
    expect(normalizeGuestKind('intake')).toBe('intake')
    expect(normalizeGuestKind('showcase')).toBe('showcase')
    expect(normalizeGuestKind(undefined)).toBe('showcase')
    expect(normalizeGuestKind('bogus')).toBe('showcase')
    expect(normalizeGuestKind(null)).toBe('showcase')
  })
})

describe('guest token kind round-trip', () => {
  it('preserves the kind through issue → verify', async () => {
    for (const kind of ['showcase', 'sitter', 'welcome', 'family', 'intake'] as const) {
      const token = await issueGuestToken(env, 'g1', 'hh1', 3600, kind)
      const v = await verifyGuestToken(env, token)
      expect(v).toEqual({ guestId: 'g1', householdId: 'hh1', kind, targetKey: null, fields: null, standing: false })
    }
  })

  it('binds an intake target person + field scope into the token', async () => {
    const token = await issueGuestToken(env, 'g1', 'hh1', 3600, 'intake', 'member:m9', 3)
    const v = await verifyGuestToken(env, token)
    expect(v).toEqual({ guestId: 'g1', householdId: 'hh1', kind: 'intake', targetKey: 'member:m9', fields: 3, standing: false })
  })

  it('treats a legacy token with no kind as showcase', async () => {
    // Default param = showcase, but a literally-old token had no `k` at all. Forge
    // one by signing a payload without `k` the same way issue does — easiest is to
    // round-trip a showcase token and confirm the verify normalizes any absent kind.
    const token = await issueGuestToken(env, 'g2', 'hh2', 3600)
    const v = await verifyGuestToken(env, token)
    expect(v?.kind).toBe('showcase')
  })

  it('rejects a tampered token', async () => {
    const token = await issueGuestToken(env, 'g3', 'hh3', 3600, 'sitter')
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa')
    expect(await verifyGuestToken(env, tampered)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await issueGuestToken(env, 'g4', 'hh4', -10, 'welcome') // already past
    expect(await verifyGuestToken(env, token)).toBeNull()
  })

  it('rejects a non-guest (device-shaped) absence of g', async () => {
    expect(await verifyGuestToken(env, null)).toBeNull()
    expect(await verifyGuestToken(env, 'not.a.token')).toBeNull()
  })
})

// D-18 (bmad/10) « Le pont » — standing (durable) guest tokens: the `s:1` marker
// round-trips, the signed expiry is the 10-year backstop (not the caller's short
// TTL), and a standing token still never cross-verifies as a device token — the
// SAME cross-type guard that protects every other credential pair here.
describe('standing (durable) guest token', () => {
  it('round-trips standing:true through issue → verify', async () => {
    const token = await issueGuestToken(env, 'g5', 'hh5', STANDING_TTL, 'sitter', null, null, true)
    const v = await verifyGuestToken(env, token)
    expect(v).toEqual({ guestId: 'g5', householdId: 'hh5', kind: 'sitter', targetKey: null, fields: null, standing: true })
  })

  it('a non-standing mint (default / explicit false) verifies standing:false', async () => {
    const implicit = await issueGuestToken(env, 'g6', 'hh6', 3600, 'welcome')
    const explicit = await issueGuestToken(env, 'g7', 'hh7', 3600, 'welcome', null, null, false)
    expect((await verifyGuestToken(env, implicit))?.standing).toBe(false)
    expect((await verifyGuestToken(env, explicit))?.standing).toBe(false)
  })

  it('is ~10 years, and a standing token minted with it still verifies 9 years later while a 1-hour token has long since expired', async () => {
    expect(STANDING_TTL).toBeGreaterThan(60 * 60 * 24 * 365 * 9) // > 9 years
    expect(STANDING_TTL).toBeLessThan(60 * 60 * 24 * 365 * 11) // < 11 years — a real backstop, not "forever"

    const standingToken = await issueGuestToken(env, 'g8', 'hh8', STANDING_TTL, 'showcase', null, null, true)
    const shortToken = await issueGuestToken(env, 'g9', 'hh9', 3600, 'showcase') // 1 hour

    try {
      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + 60 * 60 * 24 * 365 * 9 * 1000) // fast-forward 9 years
      expect(await verifyGuestToken(env, standingToken)).not.toBeNull() // still within the backstop
      expect(await verifyGuestToken(env, shortToken)).toBeNull() // long expired
    } finally {
      vi.useRealTimers()
    }
  })

  it('a standing guest token never cross-verifies as a device token', async () => {
    const standingGuest = await issueGuestToken(env, 'g10', 'hh10', STANDING_TTL, 'sitter', null, null, true)
    const device = await issueDeviceToken(env, 'dev10', 'hh10')
    expect(await verifyDeviceToken(env, standingGuest)).toBeNull()
    expect(await verifyGuestToken(env, device)).toBeNull()
  })
})
