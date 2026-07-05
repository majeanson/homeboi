import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { memberRefStatements } from './members'
import type { Env } from './env'

// A member DELETE must detach EVERY table that FK-references members(id), or D1
// rejects the whole batch and the member silently can't be removed (the sample
// "Léa" bug: a seeded `mot` on her blocked her delete). `memberRefStatements` is
// the single authoritative cleanup list — this test guards it against drift the
// same way calm-tenets guards the schema: it scans every migration for a
// `REFERENCES members` column and fails if the cleanup doesn't touch that table.
// So the next migration that points a new column at members without updating the
// list fails the build here, not in production.
const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'db', 'migrations')

// Full schema, `--` comment lines stripped, lowercased (comments name tables to
// explain them; only real DDL counts).
const schema = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

// Every table with a column `... REFERENCES members(id)`: for each occurrence, the
// nearest preceding `CREATE TABLE <name>` owns it (robust to paren nesting).
function tablesReferencingMembers(): Set<string> {
  const tables = new Set<string>()
  const re = /references\s+members\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(schema))) {
    const before = schema.slice(0, m.index)
    const create = [...before.matchAll(/create\s+table\s+(\w+)/g)].pop()
    if (create) tables.add(create[1])
  }
  return tables
}

// Collect the SQL `memberRefStatements` emits, via a fake env that just records it.
function emittedSql(): string[] {
  const sqls: string[] = []
  const env = {
    DB: {
      prepare: (sql: string) => {
        sqls.push(sql.toLowerCase())
        return { bind: () => ({}) }
      },
    },
  } as unknown as Env
  memberRefStatements(env, 'hh', 'id') // populates `sqls` as a side effect
  return sqls
}

describe('member deletion FK cleanup', () => {
  const referencing = tablesReferencingMembers()
  const sqls = emittedSql()

  it('finds the known member-referencing tables (sanity)', () => {
    // A floor so a broken scan (0 matches) can't make the coverage test vacuous.
    expect(referencing.has('recipe_loves')).toBe(true)
    expect(referencing.has('mots')).toBe(true)
    expect(referencing.has('schedule_blocks')).toBe(true)
    expect(referencing.size).toBeGreaterThanOrEqual(12)
  })

  for (const table of [...tablesReferencingMembers()].sort()) {
    it(`detaches or deletes ${table}`, () => {
      const touched = sqls.some((s) => new RegExp(`\\b(delete from|update)\\s+${table}\\b`).test(s))
      expect(touched).toBe(true)
    })
  }

  it('DELETEs the NOT NULL refs (rows are the member’s own), not SET NULL', () => {
    for (const t of ['recipe_loves', 'schedule_blocks', 'mots']) {
      expect(sqls.some((s) => new RegExp(`delete from ${t}\\b`).test(s))).toBe(true)
    }
  })
})
