import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CHILD_TABLES, EXEMPT_TABLES, HOUSEHOLD_TABLES, isSandboxEmail, sandboxEmail } from './demoHousehold'

// The sandbox sweep (deleteHousehold) must cover EVERY table, or a demo
// visitor's rows leak forever in a table nobody listed. Same structural-guard
// pattern as calm-tenets.test.ts: scan the migrations, fail the build the moment
// a new CREATE TABLE isn't in exactly one of the sweep's three sets.
//
// It REPLAYS the migrations in order — CREATE adds a table, DROP removes it, RENAME
// moves it — and reasons about the schema that actually exists at the end, not about
// every name that was ever created. The first version only collected CREATEs, and it
// was green for months over three tables that 0091 and 0102 had DROPPED
// (intake_media, postbox_media, family_shares) but the sweep still listed. D1 runs
// deleteHousehold's batch as ONE transaction, so `DELETE FROM` a missing table
// does not skip a statement — it rolls back the whole sweep, and every expired sandbox
// stays. A guard that walks the wrong shape reports the wrong thing with total
// confidence (CLAUDE.md, the standing lesson); this one went red on the very first
// replay, on the tables above — before it found the ones it was rewritten for (0132).
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const ddl = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

/** The tables that exist after every migration has run, in filename order. */
function liveTables(): Set<string> {
  const live = new Set<string>()
  const re = /CREATE TABLE (?:IF NOT EXISTS )?(\w+)|DROP TABLE (?:IF EXISTS )?(\w+)|ALTER TABLE (\w+)\s+RENAME TO (\w+)/gi
  for (const m of ddl.matchAll(re)) {
    if (m[1]) live.add(m[1])
    else if (m[2]) live.delete(m[2])
    else if (m[3]) {
      live.delete(m[3])
      live.add(m[4])
    }
  }
  return live
}
const createdTables = [...liveTables()]

describe('demo sandbox sweep covers the whole schema', () => {
  const covered = new Set<string>([
    ...HOUSEHOLD_TABLES,
    ...CHILD_TABLES.map(([table]) => table),
    ...Object.keys(EXEMPT_TABLES),
  ])

  it('the replay saw the schema (a regex that matched nothing would pass everything below)', () => {
    // 0050 renamed contact_links_new → contact_links; 0091 dropped intake_media.
    // Both are facts of the migrations on disk, so this pins that the replay is
    // reading them rather than an empty set.
    expect(createdTables).toContain('contact_links')
    expect(createdTables).not.toContain('contact_links_new')
    expect(createdTables).not.toContain('intake_media')
    expect(createdTables.length).toBeGreaterThan(50)
  })

  for (const table of createdTables) {
    it(`accounts for "${table}"`, () => {
      expect(covered.has(table)).toBe(true)
    })
  }

  it('lists no table twice across the three sets', () => {
    const all = [...HOUSEHOLD_TABLES, ...CHILD_TABLES.map(([t]) => t), ...Object.keys(EXEMPT_TABLES)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('sweeps no table that no longer exists (one missing table rolls back the whole batch)', () => {
    const real = new Set(createdTables)
    for (const table of [...HOUSEHOLD_TABLES, ...CHILD_TABLES.map(([t]) => t)]) {
      expect(real.has(table), `"${table}" is swept but is not in the schema after every migration ran`).toBe(true)
    }
  })

  it('exempts no table that no longer exists (a stale exemption is noise the next reader trusts)', () => {
    const real = new Set(createdTables)
    for (const table of Object.keys(EXEMPT_TABLES)) {
      expect(real.has(table), `"${table}" is exempted but is not in the schema after every migration ran`).toBe(true)
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
