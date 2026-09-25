import { describe, it, expect } from 'vitest'
import { dumpHousehold, planDump } from './takeout'
import type { Env } from './env'

// The nightly cron backs up EVERY household in ONE Worker invocation, and D1 counts
// every prepare().all() — and every batch(), whatever it carries — as one API request
// against that invocation's budget. On 2026-09-25 the dump cost ~2 requests per table
// per household (a PRAGMA, then the SELECT: ~145 for ~72 tables) and the run died at the
// ninth of fifteen households. This holds the shape that fixed it: the plan is ONE
// batch of PRAGMAs, and a household's rows are ONE batch (chunked at 50) — so fifteen
// households, or a hundred, stay far under a thousand.
//
// A stub D1 that COUNTS requests: .all() = 1, .batch() = 1. `sqlite_master` answers
// TABLES names; every PRAGMA says the table has household_id; every SELECT returns one
// row. `refuse` names a table whose SELECT throws — the batch is atomic, so the fallback
// walk must land it in `skipped` and still export the rest.
function stubEnv(tables: string[], refuse?: string) {
  let requests = 0
  const stmt = (sql: string) => {
    const run = async () => {
      if (refuse && sql === `SELECT * FROM ${refuse} WHERE household_id = ?1`) throw new Error('refused')
      if (sql.startsWith('SELECT name FROM sqlite_master')) return { results: tables.map((name) => ({ name })) }
      if (sql.startsWith('PRAGMA table_info')) return { results: [{ name: 'id' }, { name: 'household_id' }] }
      return { results: [{ id: 'r1' }] }
    }
    const s = { sql, bind: () => s, all: async () => (requests++, run()) }
    return s
  }
  const env = {
    DB: {
      prepare: (sql: string) => stmt(sql),
      batch: async (stmts: { sql: string; all: () => Promise<unknown> }[]) => {
        requests++
        // Atomic: one refused statement fails the whole batch.
        const out = []
        for (const s of stmts) {
          if (refuse && s.sql === `SELECT * FROM ${refuse} WHERE household_id = ?1`) throw new Error('refused')
          out.push(await (s as unknown as { all: () => Promise<unknown> }).all())
        }
        requests -= stmts.length // .all() counted each; a batch is ONE request
        return out
      },
    },
  } as unknown as Env
  return { env, count: () => requests }
}

const TABLES = Array.from({ length: 72 }, (_, i) => `t${String(i).padStart(2, '0')}`)

describe('dumpHousehold — the API-request budget', () => {
  it('a plan is one sqlite_master read + one batch of PRAGMAs (two chunks for 72 tables)', async () => {
    const { env, count } = stubEnv(TABLES)
    const plan = await planDump(env)
    expect(plan.queries).toHaveLength(72)
    expect(count()).toBe(3)
  })

  it('a household is two requests with a plan in hand — never one per table', async () => {
    // Red against the old walk (145+ here) and against forgetting to pass the plan.
    const { env, count } = stubEnv(TABLES)
    const plan = await planDump(env)
    const before = count()
    const dump = await dumpHousehold(env, 'h1', plan)
    expect(count() - before).toBe(2)
    expect(Object.keys(dump.tables)).toHaveLength(72)
    expect(dump.household).toEqual({ id: 'r1' })
  })

  it('fifteen households — the night that failed — stay well under a thousand requests', async () => {
    const { env, count } = stubEnv(TABLES)
    const plan = await planDump(env)
    for (let i = 0; i < 15; i++) await dumpHousehold(env, `h${i}`, plan)
    expect(count()).toBeLessThan(60)
  })

  it('one table D1 refuses lands in skipped and the rest still export (the walk is the fallback)', async () => {
    // Red against dropping the fallback: the batch throws and the whole dump dies.
    const { env } = stubEnv(TABLES, 't10')
    const dump = await dumpHousehold(env, 'h1')
    expect(dump.skipped).toContain('t10')
    expect(dump.tables.t10).toBeUndefined()
    expect(Object.keys(dump.tables)).toHaveLength(71)
    expect(dump.household).toEqual({ id: 'r1' })
  })
})
