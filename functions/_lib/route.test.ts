import { describe, it, expect } from 'vitest'
import { authed } from './route'
import { issueSession, issueDeviceToken, issueGuestToken } from './auth'
import type { Env, Ctx } from './env'
import type { Actor } from './household'

// A 32+ char secret so requireSessionSecret accepts it (see auth.ts).
const SECRET = 'test-secret-test-secret-test-secret'

// A DB stub whose single row answers every `.first()` — enough for resolveActor,
// which looks up exactly one operator/device row per request.
const stubDb = (firstRow: unknown): D1Database =>
  ({
    prepare: () => ({
      bind: () => ({
        first: async () => firstRow,
        run: async () => ({}),
        all: async () => ({ results: [] }),
      }),
    }),
  }) as unknown as D1Database

const envWith = (firstRow: unknown): Env =>
  ({ DB: stubDb(firstRow), SESSION_SECRET: SECRET }) as Env

// `Cookie` is a forbidden request header that the runtime's Request constructor
// silently drops, so we hand authed a minimal request exposing only what
// resolveActor + the error boundary touch: method, url, headers.get.
const reqWith = (headers: Record<string, string>, method = 'POST'): Request =>
  ({
    method,
    url: 'https://x/api/thing',
    headers: { get: (k: string) => headers[k] ?? null },
  }) as unknown as Request

const ctxFor = (env: Env, request: Request): Ctx => ({ env, request }) as unknown as Ctx

describe('authed', () => {
  it('rejects an unauthenticated request with 401 and never runs the handler', async () => {
    let ran = false
    const handler = authed(async () => {
      ran = true
      return new Response('ok')
    })
    const res = await handler(ctxFor(envWith(null), reqWith({})))
    expect(res.status).toBe(401)
    expect(ran).toBe(false)
  })

  it('runs the handler with the resolved operator actor', async () => {
    let seen: Actor | null = null
    const handler = authed(async (_ctx, actor) => {
      seen = actor
      return new Response('ok')
    })
    const env = envWith({ household_id: 'hh1' })
    const { session } = await issueSession(env, 'a@b.com')
    const res = await handler(ctxFor(env, reqWith({ Cookie: `bb_session=${session}` })))
    expect(res.status).toBe(200)
    expect(seen!.householdId).toBe('hh1')
    expect(seen!.scope).toBe('operator')
  })

  it('forbids a kiosk device on an operator-scoped handler', async () => {
    const env = envWith({ id: 'dev1', household_id: 'hh1' })
    const token = await issueDeviceToken(env, 'dev1', 'hh1')
    let ran = false
    const handler = authed(async () => {
      ran = true
      return new Response('ok')
    }, 'operator')
    const res = await handler(ctxFor(env, reqWith({ 'X-Device-Token': token })))
    expect(res.status).toBe(403)
    expect(ran).toBe(false)
  })

  it('forbids a guest from any mutating method and never runs the handler', async () => {
    const env = envWith({ id: 'hh1' })
    const token = await issueGuestToken(env, 'g1', 'hh1', 3600)
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      let ran = false
      const handler = authed(async () => {
        ran = true
        return new Response('ok')
      })
      const res = await handler(ctxFor(env, reqWith({ 'X-Device-Token': token }, method)))
      expect(res.status).toBe(403)
      expect(ran).toBe(false)
    }
  })

  it('lets a guest read (GET) with the resolved guest actor', async () => {
    const env = envWith({ id: 'hh1' })
    const token = await issueGuestToken(env, 'g1', 'hh1', 3600)
    let seen: Actor | null = null
    const handler = authed(async (_ctx, actor) => {
      seen = actor
      return new Response('ok')
    })
    const res = await handler(ctxFor(env, reqWith({ 'X-Device-Token': token }, 'GET')))
    expect(res.status).toBe(200)
    expect(seen!.scope).toBe('guest')
    expect(seen!.householdId).toBe('hh1')
  })

  it('turns a thrown error into a clean 500 instead of leaking it', async () => {
    const handler = authed(async () => {
      throw new Error('boom')
    })
    const env = envWith({ household_id: 'hh1' })
    const { session } = await issueSession(env, 'a@b.com')
    const res = await handler(ctxFor(env, reqWith({ Cookie: `bb_session=${session}` })))
    expect(res.status).toBe(500)
    expect(await res.json()).toHaveProperty('error')
  })
})
