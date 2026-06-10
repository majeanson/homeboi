import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword, safeEqual } from './password'

describe('password hashing', () => {
  it('round-trips: a hashed password verifies', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(stored.startsWith('v1$100000$')).toBe(true)
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('bonjour-hi-12345')
    expect(await verifyPassword('bonjour-hi-12346', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('salts: the same password hashes differently each time', async () => {
    const a = await hashPassword('même mot de passe')
    const b = await hashPassword('même mot de passe')
    expect(a).not.toBe(b)
    expect(await verifyPassword('même mot de passe', a)).toBe(true)
    expect(await verifyPassword('même mot de passe', b)).toBe(true)
  })

  it('returns false (never throws) on malformed stored values', async () => {
    for (const bad of [null, undefined, '', 'v2$1$a$b', 'v1$notanumber$a$b', 'v1$1000$!!$@@', 'plaintext']) {
      expect(await verifyPassword('whatever', bad)).toBe(false)
    }
  })
})

describe('safeEqual', () => {
  it('matches equal strings, rejects different ones', () => {
    expect(safeEqual('secret', 'secret')).toBe(true)
    expect(safeEqual('secret', 'Secret')).toBe(false)
    expect(safeEqual('secret', 'secret ')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})
