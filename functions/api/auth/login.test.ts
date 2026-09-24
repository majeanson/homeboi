import { describe, it, expect } from 'vitest'
import { onRequestPost } from './login'
import type { Env, Ctx } from '../../_lib/env'
import { hashPassword } from '../../_lib/password'

// The rate limit sits BEFORE any lookup or hashing (STATE.md §4-L, L2): a refused
// attempt must cost nothing and reveal nothing. The DB stub here THROWS on any use,
// so a 429 that reached the database would surface as a 500 instead.

const untouchableDb = () =>
  ({
    prepare: () => {
      throw new Error('the limiter must answer before the database is touched')
    },
  }) as unknown as D1Database

const refusing: RateLimit = { limit: async () => ({ success: false }) }
const allowing: RateLimit = { limit: async () => ({ success: true }) }

function ctx(env: Partial<Env>, body: unknown, ip = '5.5.5.5'): Ctx {
  const request = new Request('https://x/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  })
  return { env: { DB: untouchableDb(), SESSION_SECRET: 's'.repeat(40), ...env } as Env, request } as unknown as Ctx
}

describe('POST auth/login — rate limit', () => {
  it('answers 429 with Retry-After when the address is over its bound, before any lookup', async () => {
    const res = await onRequestPost(ctx({ LIMIT_IP: refusing, LIMIT_KEY: allowing }, { email: 'a@b.com', password: 'x' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await res.json()).toEqual({ error: 'Trop d’essais. Réessaie dans une minute.' })
  })

  it('answers 429 when the EMAIL is over its bound, whatever the address', async () => {
    const res = await onRequestPost(ctx({ LIMIT_IP: allowing, LIMIT_KEY: refusing }, { email: 'a@b.com', password: 'x' }))
    expect(res.status).toBe(429)
  })

  it('a malformed email is refused (400) without charging the email bucket', async () => {
    let charged: string[] = []
    const spy: RateLimit = {
      limit: async ({ key }) => {
        charged.push(key)
        return { success: true }
      },
    }
    const res = await onRequestPost(ctx({ LIMIT_IP: spy, LIMIT_KEY: spy }, { email: 'nope', password: 'x' }))
    expect(res.status).toBe(400)
    expect(charged).toEqual(['ip:5.5.5.5'])
  })
})

// The shared LOGIN_PASSWORD, SET — the one shape the d1 harness cannot bind (its env is
// fixed per run with it empty), and the one production runs. It is the lock on LEGACY
// accounts (no password_hash) and nothing else: it must open a legacy row, must not open
// an account that has its own password, and must not conjure an account that does not
// exist (2026-09-24). Every row lookup answers the same stub row — the operator lookup
// and signInAs's session_version read both land on it.
const SHARED = 'the-shared-code'
const dbWith = (row: unknown) =>
  ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) }) as unknown as D1Database

describe('POST auth/login — the shared LOGIN_PASSWORD', () => {
  const login = (row: unknown, password: string) =>
    onRequestPost(ctx({ DB: dbWith(row), LOGIN_PASSWORD: SHARED }, { email: 'old@b.com', password }))

  it('opens a legacy account with the shared code, and only with it', async () => {
    // Red against dropping the `required && !safeEqual(…)` check (any password opens it).
    const legacy = { password_hash: null }
    expect((await login(legacy, SHARED)).status).toBe(200)
    expect((await login(legacy, 'not the code')).status).toBe(401)
    expect((await login(legacy, '')).status).toBe(401)
    expect((await login(legacy, `${SHARED}x`)).status).toBe(401)
  })

  it('does NOT open an account that has its own password', async () => {
    // Red against checking the shared code before (or instead of) the row's own hash —
    // the invite code was handed to other households, so this is the property that
    // keeps their knowing it from opening a signup-era account.
    const own = { password_hash: await hashPassword('my own password') }
    expect((await login(own, SHARED)).status).toBe(401)
    expect((await login(own, 'my own password')).status).toBe(200)
  })

  it('does not conjure an account for an unknown email, even with the shared code', async () => {
    // Red against restoring the first-login path (it answered 200 and made a household).
    expect((await login(null, SHARED)).status).toBe(401)
  })
})
