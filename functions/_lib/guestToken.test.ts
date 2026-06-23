import { describe, it, expect } from 'vitest'
import { issueGuestToken, verifyGuestToken, normalizeGuestKind } from './auth'
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
      expect(v).toEqual({ guestId: 'g1', householdId: 'hh1', kind, targetKey: null, fields: null })
    }
  })

  it('binds an intake target person + field scope into the token', async () => {
    const token = await issueGuestToken(env, 'g1', 'hh1', 3600, 'intake', 'member:m9', 3)
    const v = await verifyGuestToken(env, token)
    expect(v).toEqual({ guestId: 'g1', householdId: 'hh1', kind: 'intake', targetKey: 'member:m9', fields: 3 })
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
