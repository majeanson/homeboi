import { describe, it, expect } from 'vitest'
import { extractCreatedId, rewriteTmpId, replayVerdict, MAX_ATTEMPTS, type OutboxEntry } from './outbox'
import { ApiError } from './api'

// E-41 (bmad/08): the temp-id chain. A row added offline gets an optimistic
// `tmp-…` id; follow-up ops queued against that id must be rewritten to the real
// server id once the create replays — otherwise they 404 and are silently
// dropped (the one known way the outbox lost intent). These cover the two pure
// halves; the replay loop itself is IndexedDB-bound and exercised via e2e.

const entry = (over: Partial<OutboxEntry>): OutboxEntry => ({
  id: 'q1',
  key: 'k1',
  path: 'list',
  method: 'POST',
  affectedKeys: [['board']],
  createdAt: 1,
  ...over,
})

describe('extractCreatedId', () => {
  it('reads a top-level id (list: {id, text}; todos: {ok, id})', () => {
    expect(extractCreatedId({ id: 'r1', text: 'Lait' })).toBe('r1')
    expect(extractCreatedId({ ok: true, id: 'r2' })).toBe('r2')
  })
  it('reads one level of nesting for future {item:{id}} shapes', () => {
    expect(extractCreatedId({ item: { id: 'r3' } })).toBe('r3')
  })
  it('returns null when there is nothing id-like', () => {
    expect(extractCreatedId(null)).toBeNull()
    expect(extractCreatedId('ok')).toBeNull()
    expect(extractCreatedId({ ok: true })).toBeNull()
    expect(extractCreatedId({ id: 42 })).toBeNull() // ids here are strings
  })
})

describe('rewriteTmpId', () => {
  const TMP = 'tmp-123-abc'

  it('rewrites the id inside the body (the PATCH/DELETE {id} shape)', () => {
    const e = entry({ method: 'PATCH', body: { id: TMP, done: true } })
    const out = rewriteTmpId(e, TMP, 'real9')
    expect(out.body).toEqual({ id: 'real9', done: true })
    expect(out.path).toBe('list')
  })

  it('rewrites ids nested in arrays (clear-checked {ids:[…]})', () => {
    const e = entry({ body: { ids: ['a1', TMP, 'b2'] } })
    expect(rewriteTmpId(e, TMP, 'real9').body).toEqual({ ids: ['a1', 'real9', 'b2'] })
  })

  it('rewrites a path segment (list/tmp-… style routes)', () => {
    const e = entry({ path: `list/${TMP}`, method: 'DELETE', body: undefined })
    const out = rewriteTmpId(e, TMP, 'real9')
    expect(out.path).toBe('list/real9')
    expect(out.body).toBeUndefined()
  })

  it('returns the SAME entry object when nothing references the tmp id', () => {
    const e = entry({ body: { id: 'other' } })
    expect(rewriteTmpId(e, TMP, 'real9')).toBe(e) // identity → replay skips the put
  })

  it('never touches unrelated fields (idempotency key, queue id, keys)', () => {
    const e = entry({ body: { id: TMP } })
    const out = rewriteTmpId(e, TMP, 'real9')
    expect(out.id).toBe(e.id)
    expect(out.key).toBe(e.key)
    expect(out.affectedKeys).toEqual(e.affectedKeys)
  })
})

// The dead-letter policy. FIFO order is load-bearing (the tmp-id chain above), so
// the replay loop `break`s on a server error rather than skipping ahead — which
// meant ONE entry the server permanently 500s blocked every write queued behind
// it, forever and silently. `replayVerdict` is the pure decision that ends that.
describe('replayVerdict', () => {
  const apiErr = (status: number) => new ApiError(status, `boom ${status}`)

  it('401 stops the run for the auth-lost path (which clears the queue)', () => {
    expect(replayVerdict(apiErr(401), 0)).toBe('auth-lost')
  })

  it('drops a 4xx as moot — the row is gone/forbidden, the poll reconciles', () => {
    expect(replayVerdict(apiErr(404), 0)).toBe('drop')
    expect(replayVerdict(apiErr(403), 3)).toBe('drop')
    expect(replayVerdict(apiErr(409), 0)).toBe('drop')
  })

  it('retries a 5xx while the entry has attempts left', () => {
    expect(replayVerdict(apiErr(500), 0)).toBe('retry')
    expect(replayVerdict(apiErr(503), MAX_ATTEMPTS - 2)).toBe('retry')
  })

  it('dead-letters a 5xx once THIS attempt reaches the cap', () => {
    expect(replayVerdict(apiErr(500), MAX_ATTEMPTS - 1)).toBe('dead-letter')
    expect(replayVerdict(apiErr(500), MAX_ATTEMPTS + 9)).toBe('dead-letter')
  })

  it('waits on a transport failure WITHOUT spending an attempt', () => {
    // fetch rejects with a TypeError when the connection fails: no server answer,
    // so it says nothing about this entry. Being offline five times in a row must
    // never dead-letter a perfectly good write.
    expect(replayVerdict(new TypeError('Failed to fetch'), 0)).toBe('wait')
    expect(replayVerdict(new TypeError('Failed to fetch'), MAX_ATTEMPTS + 3)).toBe('wait')
  })
})
