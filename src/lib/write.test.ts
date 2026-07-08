import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { writeWith } from './write'

// B-9 (bmad/10) — idempotence dès le premier geste. Before this, only an
// offline-outbox REPLAY carried an Idempotency-Key (a fresh one minted at
// enqueue time); a normal online write sent none. That left a hole: wifi
// drops the RESPONSE after the server already applied the write, writeWith's
// catch sees a transport failure and queues a retry under a BRAND-NEW key, and
// the eventual replay double-applies. The fix hoists ONE key above the online
// attempt and reuses it for the queued/replayed leg — these tests pin that
// contract at the writeWith() level (network + outbox are mocked; the outbox's
// own IndexedDB plumbing is exercised in outbox.test.ts / offline-outbox.spec.ts).

// vi.mock factories are hoisted above every import/const in this file, so the
// mocks they reference must be created via vi.hoisted (a plain top-level const
// referenced inside the factory throws "Cannot access … before initialization").
const { apiMock, MockApiError, enqueueMock } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return {
    apiMock: vi.fn((_path: string, _opts?: Record<string, unknown>): Promise<unknown> => Promise.resolve(null)),
    MockApiError,
    enqueueMock: vi.fn((_entry: Record<string, unknown>): Promise<void> => Promise.resolve()),
  }
})
vi.mock('./api', () => ({ api: apiMock, ApiError: MockApiError }))
vi.mock('./outbox', () => ({
  enqueue: enqueueMock,
  onOutboxChange: () => () => {},
  outboxCount: async () => 0,
}))

// Not under test here (A-5's per-device tour heuristic) — no-op it so the test
// doesn't depend on its own localStorage bookkeeping.
vi.mock('./tourOffer', () => ({ bumpWriteCount: () => {} }))

describe('writeWith — B-9 idempotency', () => {
  beforeEach(() => {
    apiMock.mockReset()
    enqueueMock.mockClear()
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('the online attempt carries an idempotencyKey', async () => {
    apiMock.mockResolvedValue({ id: 'r1' })
    const qc = new QueryClient()
    await writeWith(qc, 'list', { method: 'POST', body: { text: 'Lait' } })

    expect(apiMock).toHaveBeenCalledOnce()
    const [path, opts] = apiMock.mock.calls[0]
    expect(path).toBe('list')
    expect(opts?.idempotencyKey).toBeTruthy()
    expect(enqueueMock).not.toHaveBeenCalled() // it landed online — nothing queued
  })

  it('a transport failure enqueues the SAME key the failed online attempt already sent', async () => {
    // A non-ApiError rejection (TypeError) is exactly what a dropped connection /
    // lost response looks like to fetch() — writeWith's catch queues on this path.
    apiMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const qc = new QueryClient()
    const res = await writeWith(qc, 'list', { method: 'POST', body: { text: 'Lait' } })

    expect(res.queued).toBe(true)
    expect(apiMock).toHaveBeenCalledOnce()
    expect(enqueueMock).toHaveBeenCalledOnce()

    const sentKey = apiMock.mock.calls[0][1]?.idempotencyKey as string | undefined
    const queuedKey = enqueueMock.mock.calls[0][0].key as string | undefined
    expect(sentKey).toBeTruthy()
    expect(queuedKey).toBe(sentKey) // NOT a fresh uuid — the B-9 fix
  })

  it('a real server rejection (ApiError) is NOT queued — it rethrows, key unused', async () => {
    apiMock.mockRejectedValue(new MockApiError(400, 'bad request'))
    const qc = new QueryClient()
    await expect(writeWith(qc, 'list', { method: 'POST', body: {} })).rejects.toBeInstanceOf(MockApiError)
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('a guest write still short-circuits before any network call or enqueue', async () => {
    localStorage.setItem('babillard-guest-token', 'tok')
    const qc = new QueryClient()
    const res = await writeWith(qc, 'list', { method: 'POST', body: { text: 'Lait' } })

    expect(res).toEqual({ data: null, queued: false })
    expect(apiMock).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
