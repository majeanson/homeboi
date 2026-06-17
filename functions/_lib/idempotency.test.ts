import { describe, it, expect } from 'vitest'
import { withIdempotency } from './idempotency'
import type { Env } from './env'

// A tiny in-memory D1 stub that understands the three statements idempotency.ts
// issues: SELECT by (household_id, key), INSERT OR IGNORE, and the prune DELETE.
// Stateful so we can assert that a replay returns the stored row without re-running.
function memDb() {
  const rows = new Map<string, { status: number; result_json: string | null; created_at: number }>()
  const apply = (sql: string, args: unknown[]) => {
    if (/^INSERT/i.test(sql)) {
      const [hh, key, status, result_json, created_at] = args as [string, string, number, string, number]
      const k = `${hh}|${key}`
      if (!rows.has(k)) rows.set(k, { status, result_json, created_at }) // OR IGNORE
    } else if (/^DELETE/i.test(sql)) {
      const [cutoff] = args as [number]
      for (const [k, v] of rows) if (v.created_at < cutoff) rows.delete(k)
    }
  }
  const stmt = (sql: string, args: unknown[]) => ({
    first: async () => {
      if (/^SELECT/i.test(sql)) {
        const [hh, key] = args as [string, string]
        const r = rows.get(`${hh}|${key}`)
        return r ? { status: r.status, result_json: r.result_json } : null
      }
      return null
    },
    run: async () => {
      apply(sql, args)
      return {}
    },
    __apply: () => apply(sql, args),
  })
  return {
    prepare: (sql: string) => ({ bind: (...args: unknown[]) => stmt(sql, args) }),
    batch: async (stmts: Array<{ __apply: () => void }>) => {
      for (const s of stmts) s.__apply()
      return []
    },
  }
}

const envWith = (db: ReturnType<typeof memDb>): Env => ({ DB: db }) as unknown as Env
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('withIdempotency', () => {
  it('runs once and replays the stored response on the same key', async () => {
    const env = envWith(memDb())
    let runs = 0
    const run = () => {
      runs++
      return jsonRes({ n: runs })
    }
    const r1 = await withIdempotency(env, 'hh1', 'k1', run)
    expect(runs).toBe(1)
    expect(await r1.json()).toEqual({ n: 1 })

    const r2 = await withIdempotency(env, 'hh1', 'k1', run)
    expect(runs).toBe(1) // handler NOT run again
    expect(r2.headers.get('X-Idempotent-Replay')).toBe('1')
    expect(await r2.json()).toEqual({ n: 1 }) // same stored body, not n:2
  })

  it('does not store a non-2xx response, so it stays retryable', async () => {
    const env = envWith(memDb())
    let runs = 0
    const run = () => {
      runs++
      return jsonRes({ error: 'boom' }, 500)
    }
    await withIdempotency(env, 'hh1', 'k2', run)
    await withIdempotency(env, 'hh1', 'k2', run)
    expect(runs).toBe(2) // re-ran because the failure wasn't recorded
  })

  it('scopes keys per household (same key, different homes both run)', async () => {
    const env = envWith(memDb())
    let runs = 0
    const run = () => {
      runs++
      return jsonRes({ ok: true })
    }
    await withIdempotency(env, 'hhA', 'same', run)
    await withIdempotency(env, 'hhB', 'same', run)
    expect(runs).toBe(2)
  })
})
