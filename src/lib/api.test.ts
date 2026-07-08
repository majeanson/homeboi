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

  it('still allows an offline-outbox replay (replay: true) for a guest', async () => {
    // A replay is an operator write authored before preview — writeWith never
    // queues a guest write, so replaying one is correct, not a guest mutation.
    localStorage.setItem('babillard-guest-preview', '1')
    await api('thing', { method: 'POST', body: {}, idempotencyKey: 'k1', replay: true })
    expect(fetchMock()).toHaveBeenCalledOnce()
  })

  it('B-9: idempotencyKey ALONE (no replay flag) does NOT bypass the guest backstop', async () => {
    // Since B-9 a normal online writeWith call also carries an idempotencyKey, so
    // key-presence can no longer be trusted as "this is a replay" — only the
    // explicit `replay` flag may bypass the guest read-only chokepoint.
    localStorage.setItem('babillard-guest-preview', '1')
    await expect(api('thing', { method: 'POST', body: {}, idempotencyKey: 'k1' })).rejects.toMatchObject({ status: 403 })
    expect(fetchMock()).not.toHaveBeenCalled()
  })

  it('lets a normal operator write through', async () => {
    await api('thing', { method: 'POST', body: {} })
    expect(fetchMock()).toHaveBeenCalledOnce()
  })
})
