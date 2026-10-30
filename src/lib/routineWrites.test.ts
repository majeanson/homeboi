import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTINES_KEY } from './queryKeys'

// The routine player's write path, against a REAL QueryClient with the transport stubbed.
// What is being pinned is the contract the toddler surface leans on:
//   · the ✓ is painted into the cache SYNCHRONOUSLY, so a second tap reads where the story is;
//   · a poll that answers with the OLD state mid-write does not un-tick the step;
//   · PATCHes leave in tap order, even if an earlier one is slow;
//   · a refused write stops being painted (and says so once);
//   · a write queued offline keeps being painted until the outbox drains.

const writeWith = vi.fn()
const writeFailed = vi.fn()
const guest = vi.fn(() => false)
let outboxListener: (() => void) | null = null
let outboxN = 1

vi.mock('./write', () => ({ writeWith: (...a: unknown[]) => writeWith(...a) }))
vi.mock('./writeFailed', () => ({ writeFailed: (e: unknown) => writeFailed(e) }))
vi.mock('./device', () => ({ isGuest: () => guest() }))
vi.mock('./outbox', () => ({
  onOutboxChange: (fn: () => void) => {
    outboxListener = fn
    return () => {
      outboxListener = null
    }
  },
  outboxCount: async () => outboxN,
}))

const { sendRoutineOp, currentDone, resetRoutineWritesForTest } = await import('./routineWrites')

type Frame = { routines: Array<{ id: string; doneIdx: number[]; timers?: Record<number, unknown> }> }
const frame = (doneIdx: number[]): Frame => ({ routines: [{ id: 'r', doneIdx }] })
const tick = (idx: number, done = true) => ({ kind: 'done', routineId: 'r', cardIdx: idx, done }) as const
const flush = () => new Promise((r) => setTimeout(r, 0))

let qc: QueryClient
beforeEach(() => {
  resetRoutineWritesForTest()
  qc = new QueryClient()
  qc.setQueryData(ROUTINES_KEY, frame([]))
  writeWith.mockReset().mockResolvedValue({ data: {}, queued: false })
  writeFailed.mockReset()
  guest.mockReturnValue(false)
  outboxListener = null
  outboxN = 1
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sendRoutineOp', () => {
  it('paints the tick into the cache before it returns — the next tap reads the truth', () => {
    sendRoutineOp(qc, tick(0))
    expect(currentDone(qc, 'r', [])).toEqual([0])
    // …and a second tap, with no render in between, builds on it instead of repeating it.
    sendRoutineOp(qc, tick(1))
    expect(currentDone(qc, 'r', [])).toEqual([0, 1])
  })

  it('two ticks of the SAME step are one tick (no [1, 1] that reads as « finished »)', () => {
    sendRoutineOp(qc, tick(1))
    sendRoutineOp(qc, tick(1))
    expect(currentDone(qc, 'r', [])).toEqual([1])
  })

  it('sends the PATCH body the server reads, to the routines endpoint', async () => {
    sendRoutineOp(qc, tick(2, false))
    await flush()
    expect(writeWith).toHaveBeenCalledTimes(1)
    const [, path, spec] = writeWith.mock.calls[0]
    expect(path).toBe('routines')
    expect(spec).toMatchObject({ method: 'PATCH', body: { routineId: 'r', cardIdx: 2, done: false } })
  })

  it('sends in tap order even when an earlier write is slow', async () => {
    const order: number[] = []
    let releaseFirst!: () => void
    writeWith.mockImplementation(async (_qc, _p, spec: { body: { cardIdx: number } }) => {
      if (spec.body.cardIdx === 0) await new Promise<void>((r) => (releaseFirst = r))
      order.push(spec.body.cardIdx)
      return { data: {}, queued: false }
    })
    sendRoutineOp(qc, tick(0))
    sendRoutineOp(qc, tick(1))
    await flush()
    expect(order).toEqual([]) // step 1's PATCH waits for step 0's
    releaseFirst()
    await flush()
    expect(order).toEqual([0, 1])
  })

  it('a poll answering with the OLD state mid-write does not un-tick the step', async () => {
    let finish!: () => void
    writeWith.mockImplementation(() => new Promise((r) => (finish = () => r({ data: {}, queued: false }))))
    sendRoutineOp(qc, tick(0))
    expect(currentDone(qc, 'r', [])).toEqual([0])

    // A poll that left before the tap and lands after it: yesterday's picture.
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([0])

    // The write lands; the next frame is the server's own, and it agrees.
    finish()
    await flush()
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([0]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([0])
  })

  it('once everything has landed it stops overriding the server (another device may change it)', async () => {
    sendRoutineOp(qc, tick(0))
    await flush()
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([]), staleTime: 0 })
    // Nothing pending any more → the server's frame is believed as-is.
    expect(currentDone(qc, 'r', [])).toEqual([])
  })

  it('a refused write stops being painted, and is reported once', async () => {
    const boom = new Error('refused')
    writeWith.mockRejectedValueOnce(boom)
    sendRoutineOp(qc, tick(0))
    expect(currentDone(qc, 'r', [])).toEqual([0]) // optimistic until the answer
    await flush()
    expect(writeFailed).toHaveBeenCalledTimes(1)
    expect(writeFailed).toHaveBeenCalledWith(boom)
    // The next frame (writeWith's own invalidate would fetch it) is no longer overridden.
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([])
  })

  it('a failure of one write does not wedge the ones behind it', async () => {
    writeWith.mockRejectedValueOnce(new Error('refused')).mockResolvedValue({ data: {}, queued: false })
    sendRoutineOp(qc, tick(0))
    sendRoutineOp(qc, tick(1))
    await flush()
    expect(writeWith).toHaveBeenCalledTimes(2)
  })

  it('keeps painting a write QUEUED offline until the outbox drains', async () => {
    writeWith.mockResolvedValue({ data: null, queued: true })
    sendRoutineOp(qc, tick(0))
    await flush()
    // Back online, a poll lands BEFORE the outbox replay: the old state must not win.
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([0])

    // Replay done → outbox empty → released.
    outboxN = 0
    outboxListener?.()
    await flush()
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([0]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([0])
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([])
  })

  it('gives up holding a queued write after a while — a refused replay cannot pin a lie', async () => {
    vi.useFakeTimers()
    writeWith.mockResolvedValue({ data: null, queued: true })
    sendRoutineOp(qc, tick(0))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(121_000)
    await qc.fetchQuery({ queryKey: ROUTINES_KEY, queryFn: async () => frame([]), staleTime: 0 })
    expect(currentDone(qc, 'r', [])).toEqual([])
  })

  it('a read-only guest neither paints nor writes', async () => {
    guest.mockReturnValue(true)
    sendRoutineOp(qc, tick(0))
    await flush()
    expect(currentDone(qc, 'r', [])).toEqual([])
    expect(writeWith).not.toHaveBeenCalled()
  })
})

describe('currentDone', () => {
  it('falls back to the caller’s list when the routine is not cached', () => {
    expect(currentDone(qc, 'nope', [3])).toEqual([3])
  })
})
