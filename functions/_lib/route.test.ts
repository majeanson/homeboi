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

// A token in auth.ts's exact wire format but WITHOUT the 0134 `v` field — what every
// cookie minted before the migration looks like.
async function signLegacy(payload: object): Promise<string> {
  const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  return `${body}.${b64url(sig)}`
}

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

  // Session versioning (0134). The stub answers every .first() with the same row, so
  // the operator row carries the version the cookie is compared against.
  it('rejects a session whose version the row has moved past (a reset ended it)', async () => {
    let ran = false
    const handler = authed(async () => {
      ran = true
      return new Response('ok')
    })
    const env = envWith({ household_id: 'hh1', session_version: 2 })
    const { session } = await issueSession(env, 'a@b.com', 1)
    const res = await handler(ctxFor(env, reqWith({ Cookie: `bb_session=${session}` })))
    expect(res.status).toBe(401)
    expect(ran).toBe(false)
  })

  it('accepts a session minted at the row’s current version', async () => {
    const env = envWith({ household_id: 'hh1', session_version: 2 })
    const { session } = await issueSession(env, 'a@b.com', 2)
    const res = await authed(async () => new Response('ok'))(ctxFor(env, reqWith({ Cookie: `bb_session=${session}` })))
    expect(res.status).toBe(200)
  })

  it('still accepts a cookie minted before 0134 (no v) against a version-1 row — the deploy signs nobody out', async () => {
    // The pre-0134 wire shape, built by hand: { e, x } signed the same way. Pinning the
    // format here is deliberate — if auth.ts ever changes the encoding, this is the
    // test that says every existing cookie just died.
    const env = envWith({ household_id: 'hh1', session_version: 1 })
    const legacy = await signLegacy({ e: 'a@b.com', x: Math.floor(Date.now() / 1000) + 3600 })
    const res = await authed(async () => new Response('ok'))(ctxFor(env, reqWith({ Cookie: `bb_session=${legacy}` })))
    expect(res.status).toBe(200)
    // …and once the row is bumped, the same legacy cookie is out like any other.
    const bumped = envWith({ household_id: 'hh1', session_version: 2 })
    const res2 = await authed(async () => new Response('ok'))(ctxFor(bumped, reqWith({ Cookie: `bb_session=${legacy}` })))
    expect(res2.status).toBe(401)
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
