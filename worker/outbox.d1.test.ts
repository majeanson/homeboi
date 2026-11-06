import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, type Session } from '../functions/test/d1'

// THE OFFLINE PROMISE, AGAINST A REAL D1 (solidify 7.2, 2026-11-05). The outbox replays a
// queued write on reconnect, and a phone may send it twice when the first answer is lost.
// `idempotency.test.ts` checks that logic against a stub, so until this file nothing had
// proved the ledger, the unique key and authed() agree with each other on real tables.

const count = async (s: Session, text: string) =>
  (
    await env.DB.prepare('SELECT COUNT(*) AS n FROM list_items WHERE household_id = ? AND text = ?')
      .bind(s.householdId, text)
      .first<{ n: number }>()
  )?.n

const add = (s: Session, key: string, text: string) =>
  s.fetch('/api/list', { method: 'POST', body: { text }, headers: { 'Idempotency-Key': key } })

describe('a replayed write never double-applies', () => {
  it('the same key twice: one row, the same answer, marked as a replay', async () => {
    const s = await household('outbox-replay', undefined, { empty: true })
    const first = await add(s, 'k-1', 'Café')
    const replay = await add(s, 'k-1', 'Café')
    expect(first.status).toBe(replay.status)
    expect(await count(s, 'Café')).toBe(1)
    expect(replay.headers.get('X-Idempotent-Replay')).toBe('1')
    expect(first.headers.get('X-Idempotent-Replay')).toBeNull()
    expect(await replay.text()).toBe(await first.text())
  })

  it('a replay answers from the ledger even when its body changed', async () => {
    const s = await household('outbox-body', undefined, { empty: true })
    await add(s, 'k-2', 'Thé')
    await add(s, 'k-2', 'Autre chose')
    expect(await count(s, 'Thé')).toBe(1)
    expect(await count(s, 'Autre chose')).toBe(0)
  })

  it('two different keys are two writes', async () => {
    const s = await household('outbox-two', undefined, { empty: true })
    await s.fetch('/api/todos', { method: 'POST', body: { text: 'Un' }, headers: { 'Idempotency-Key': 'k-3' } })
    const second = await s.fetch('/api/todos', { method: 'POST', body: { text: 'Deux' }, headers: { 'Idempotency-Key': 'k-4' } })
    expect(second.headers.get('X-Idempotent-Replay')).toBeNull()
  })

  it('the ledger is per household: the same key elsewhere still writes', async () => {
    const a = await household('outbox-a', undefined, { empty: true })
    const b = await household('outbox-b', undefined, { empty: true })
    await add(a, 'k-shared', 'Sucre')
    const other = await add(b, 'k-shared', 'Sucre')
    expect(other.headers.get('X-Idempotent-Replay')).toBeNull()
    expect(await count(b, 'Sucre')).toBe(1)
  })

  it('a refused write stays retryable: only a success enters the ledger', async () => {
    const s = await household('outbox-refused', undefined, { empty: true })
    const refused = await s.fetch('/api/list', { method: 'POST', body: { text: '' }, headers: { 'Idempotency-Key': 'k-5' } })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    const retried = await add(s, 'k-5', 'Farine')
    expect(retried.headers.get('X-Idempotent-Replay')).toBeNull()
    expect(await count(s, 'Farine')).toBe(1)
  })
})
