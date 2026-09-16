import { describe, it, expect } from 'vitest'
import { onRequestPost } from './login'
import type { Env, Ctx } from '../../_lib/env'

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
