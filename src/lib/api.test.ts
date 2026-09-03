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

// A stalled connection (captive portal, a weak store signal — packets silently
// dropped, no TCP RST) used to leave api()'s fetch unresolved forever: a FREQUENT
// user, offline in a store, saw only a loading spinner because AuthProvider.refresh()
// awaits api('auth/me') inside try/finally, and `finally` never ran. api() must give
// up and reject rather than hang.
describe('api() timeout on a stalled connection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    localStorage.clear()
  })

  // A fetch mock that mimics the real contract: it never settles on its own, but
  // DOES reject once the AbortSignal it was given fires — exactly what the
  // platform's fetch does when api()'s internal AbortController times out.
  const hangingFetch = () =>
    vi.fn((_url: string, opts: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
      })
    })

  it('rejects a plain call once DEFAULT_TIMEOUT_MS elapses, instead of hanging forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const promise = api('board')
    let settled = false
    promise.catch(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(settled).toBe(false) // not yet — still under the bound
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toThrow()
  })

  it('gives a Blob upload more room than a plain call before timing out', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const promise = api('note-media', { method: 'POST', body: new Blob(['x']) })
    let settled = false
    promise.catch(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(20_000) // past the plain-call bound
    expect(settled).toBe(false) // …but uploads get a longer leash
    await vi.advanceTimersByTimeAsync(40_000) // now past the upload bound (60s)
    await expect(promise).rejects.toThrow()
  })

  // fetch() resolves as soon as HEADERS arrive — the body is a separate stream
  // read afterward. A connection that answers the handshake and then stalls
  // mid-body (a captive portal, a signal cutting out right after) must stay
  // bounded too, one phase later than the connection stall the tests above cover.
  it('also bounds a stall in the response BODY, after fetch() itself already resolved', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, opts: { signal: AbortSignal }) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: () =>
            new Promise((_resolve, reject) => {
              opts.signal.addEventListener('abort', () =>
                reject(new DOMException('The operation was aborted.', 'AbortError')),
              )
            }),
        } as unknown as Response)
      }),
    )
    const promise = api('board')
    let settled = false
    promise.catch(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toThrow()
  })

  // A keepalive request (the undo toast's pagehide flush, lib/toast.tsx) exists
  // specifically to outlive teardown — timing it out would defeat the point, so it
  // must get NO AbortSignal at all rather than a longer one.
  it('does not attach a timeout/AbortSignal to a keepalive request', async () => {
    const spy = vi.fn((_url: string, _opts: { signal?: AbortSignal; keepalive?: boolean }) => Promise.resolve(ok()))
    vi.stubGlobal('fetch', spy)
    const orig = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      await api('thing', { method: 'POST', body: { x: 1 } })
    } finally {
      if (orig) Object.defineProperty(document, 'visibilityState', orig)
    }
    const [, opts] = spy.mock.calls[0]
    expect(opts.keepalive).toBe(true)
    expect(opts.signal).toBeUndefined()
  })
})
