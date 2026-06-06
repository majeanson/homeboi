import { describe, it, expect } from 'vitest'
import { onRequest } from './_middleware'
import type { Env } from './_lib/env'

// Minimal context for the middleware: it only touches request.url/method/
// headers.get and ctx.next(). `next` is the downstream handler chain.
type Next = () => Promise<Response>
const ctxFor = (
  opts: { method?: string; path?: string; headers?: Record<string, string>; next: Next },
) =>
  ({
    request: {
      method: opts.method ?? 'GET',
      url: `https://x/${opts.path ?? 'api/thing'}`,
      headers: { get: (k: string) => opts.headers?.[k] ?? null },
    },
    env: {} as Env,
    next: opts.next,
  }) as unknown as Parameters<typeof onRequest>[0]

describe('middleware error boundary', () => {
  it('turns a thrown handler error into a 500 for /api/*', async () => {
    const res = await onRequest(ctxFor({ next: async () => { throw new Error('boom') } }))
    expect(res.status).toBe(500)
  })

  it('passes a successful handler response straight through', async () => {
    const sentinel = new Response('ok', { status: 200 })
    const res = await onRequest(ctxFor({ next: async () => sentinel }))
    expect(res).toBe(sentinel)
  })

  it('does not wrap non-api routes in the JSON error shape', async () => {
    // A static asset that throws should propagate, not become a JSON 500.
    await expect(
      onRequest(ctxFor({ path: 'index.html', next: async () => { throw new Error('boom') } })),
    ).rejects.toThrow('boom')
  })
})

describe('middleware CSRF gate', () => {
  it('rejects a state-changing api request with no CSRF token', async () => {
    let ran = false
    const res = await onRequest(
      ctxFor({ method: 'POST', next: async () => { ran = true; return new Response('ok') } }),
    )
    expect(res.status).toBe(403)
    expect(ran).toBe(false)
  })

  it('lets a device-token request through (its header is the credential)', async () => {
    const sentinel = new Response('ok')
    const res = await onRequest(
      ctxFor({ method: 'POST', headers: { 'X-Device-Token': 'tok' }, next: async () => sentinel }),
    )
    expect(res).toBe(sentinel)
  })

  it('lets a CSRF-exempt route (login) through without a token', async () => {
    const sentinel = new Response('ok')
    const res = await onRequest(
      ctxFor({ method: 'POST', path: 'api/auth/login', next: async () => sentinel }),
    )
    expect(res).toBe(sentinel)
  })

  it('does not gate safe methods', async () => {
    const sentinel = new Response('ok')
    const res = await onRequest(ctxFor({ method: 'GET', next: async () => sentinel }))
    expect(res).toBe(sentinel)
  })
})
