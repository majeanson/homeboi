import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

// The api() read-only backstop: a guest session (link token OR the operator's
// settings preview) must never mutate, even via direct api() callers that bypass
// writeWith() (media upload, ghost toggle, contact-photo edits). For the operator
// PREVIEW the server can't help — it sees a full operator session — so this
// client chokepoint is the only line. Reads and offline replays still pass.

const ok = () =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ ok: true }),
  }) as unknown as Response

describe('api() read-only guest backstop', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(ok))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>

  it('refuses a mutating call in operator preview without touching the network', async () => {
    localStorage.setItem('babillard-guest-preview', '1')
    await expect(api('ghost', { method: 'PATCH', body: {} })).rejects.toMatchObject({ status: 403 })
    await expect(api('ghost', { method: 'PATCH', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock()).not.toHaveBeenCalled()
  })

  it('refuses a mutating call for a link guest token', async () => {
    localStorage.setItem('babillard-guest-token', 'tok')
    await expect(api('thing', { method: 'DELETE', body: {} })).rejects.toMatchObject({ status: 403 })
    expect(fetchMock()).not.toHaveBeenCalled()
  })

  it('still allows reads (GET) for a guest', async () => {
    localStorage.setItem('babillard-guest-preview', '1')
    await api('board')
    expect(fetchMock()).toHaveBeenCalledOnce()
  })

  it('still allows an offline-outbox replay (idempotencyKey) for a guest', async () => {
    // A replay is an operator write authored before preview — writeWith never
    // queues a guest write, so replaying one is correct, not a guest mutation.
    localStorage.setItem('babillard-guest-preview', '1')
    await api('thing', { method: 'POST', body: {}, idempotencyKey: 'k1' })
    expect(fetchMock()).toHaveBeenCalledOnce()
  })

  it('lets a normal operator write through', async () => {
    await api('thing', { method: 'POST', body: {} })
    expect(fetchMock()).toHaveBeenCalledOnce()
  })
})
