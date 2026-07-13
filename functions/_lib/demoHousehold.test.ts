import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CHILD_TABLES, EXEMPT_TABLES, HOUSEHOLD_TABLES, isSandboxEmail, sandboxEmail } from './demoHousehold'

// The sandbox sweep (deleteDemoHousehold) must cover EVERY table, or a demo
// visitor's rows leak forever in a table nobody listed. Same structural-guard
// pattern as calm-tenets.test.ts: scan the migrations, fail the build the moment
// a new CREATE TABLE isn't in exactly one of the sweep's three sets.
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const ddl = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

const createdTables = [...ddl.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map((m) => m[1])

describe('demo sandbox sweep covers the whole schema', () => {
  const covered = new Set<string>([
    ...HOUSEHOLD_TABLES,
    ...CHILD_TABLES.map(([table]) => table),
    ...Object.keys(EXEMPT_TABLES),
  ])

  for (const table of new Set(createdTables)) {
    it(`accounts for "${table}"`, () => {
      expect(covered.has(table)).toBe(true)
    })
  }

  it('lists no table twice across the three sets', () => {
    const all = [...HOUSEHOLD_TABLES, ...CHILD_TABLES.map(([t]) => t), ...Object.keys(EXEMPT_TABLES)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('lists no table that does not exist (a rename would silently stop sweeping)', () => {
    const real = new Set(createdTables)
    for (const table of [...HOUSEHOLD_TABLES, ...CHILD_TABLES.map(([t]) => t)]) {
      expect(real.has(table), `"${table}" is swept but never created in a migration`).toBe(true)
    }
  })
})

// « Garder ma maisonnée » (demo/claim.ts) rewrites the operators.email in place —
// that ONE column is how the sweep + cap identify a sandbox (the SQL LIKE pattern
// isSandboxEmail mirrors), so these pin that a claimed household leaves the
// sweepable set while a live sandbox stays in it.
describe('sandbox identification (the sweep-skip contract of the claim flow)', () => {
  it('a freshly-minted sandbox email is sweepable', () => {
    expect(isSandboxEmail(sandboxEmail('AbC123xyz'))).toBe(true)
  })

  it('a claimed (real) email is never swept', () => {
    for (const email of ['famille@exemple.ca', 'marc.jeanson92@gmail.com', 'demo-fan@gmail.com']) {
      expect(isSandboxEmail(email)).toBe(false)
    }
  })

  it('the legacy read-only singleton (demo@, no dash) is not a sandbox', () => {
    expect(isSandboxEmail('demo@babillard.invalid')).toBe(false)
  })

  it('claim.ts cannot re-issue an address inside the sandbox namespace (guarded by suffix)', () => {
    // The handler rejects any @babillard.invalid target; this pins the predicate
    // side — a would-be claimed sandbox-shaped email would still read as a sandbox.
    expect(isSandboxEmail('demo-somebody@babillard.invalid')).toBe(true)
  })
})
