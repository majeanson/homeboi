import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { liveTables } from '../test/schema'

// EVERY TABLE THE WORKER'S SQL NAMES MUST EXIST.
//
// Written 2026-09-30, the day after a near-miss nothing would have caught: migration 0142
// moved the `mots` into `notes`, and `members.ts` — the one list that detaches a deleted
// member from everything — still said `DELETE FROM mots`. It kept working only because
// 0142 left the old table in place. The migration that dropped it (0143) would have turned
// every member deletion into a 500, with every test green: nothing checks that a table a
// handler names still exists. D1 only says so at run time, to whoever pressed the button.
//
// So: replay the migrations (test/schema), then read every non-test source file in
// `functions/` and `worker/` for `FROM | INTO | UPDATE | JOIN <table>`. A name that is
// neither a live table, a CTE the same file defines (`WITH … sub AS`), nor one of
// SQLite's own tables fails the build. SQL keywords are written UPPERCASE here and table
// names lowercase, which is what makes a plain scan exact: « from the board » in a
// comment never matches (and comment lines are skipped anyway).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SQLITE_OWN = new Set(['sqlite_master', 'sqlite_schema', 'pragma_table_info', 'json_each', 'json_tree'])

function sources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'test' && e.name !== 'node_modules') out.push(...sources(p))
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/** `table → files` for every name the SQL uses that the schema does not have. */
function unknownTables(files: string[], live: Set<string>): Map<string, string[]> {
  const unknown = new Map<string, string[]>()
  for (const f of files) {
    const code = readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    const ctes = new Set([...code.matchAll(/\bWITH\s+(?:RECURSIVE\s+)?([a-z_]\w*)\s*(?:\([^)]*\))?\s+AS\b/g)].map((m) => m[1]))
    for (const m of code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_][a-z0-9_]*)\b/g)) {
      const name = m[1]
      if (live.has(name) || ctes.has(name) || SQLITE_OWN.has(name)) continue
      const rel = relative(root, f).split(sep).join('/')
      unknown.set(name, [...new Set([...(unknown.get(name) ?? []), rel])])
    }
  }
  return unknown
}

describe('the Worker only names tables that exist', () => {
  const live = liveTables()
  const files = [...sources(join(root, 'functions')), ...sources(join(root, 'worker'))]

  it('finds the schema and the sources at all', () => {
    // Against a vacuous pass: a replay or a walk that stopped matching reports « all fine ».
    expect(live.size).toBeGreaterThan(50)
    expect(live.has('notes')).toBe(true)
    expect(live.has('mots'), '0143 dropped it — the replay must see the DROP').toBe(false)
    expect(files.length).toBeGreaterThan(150)
  })

  it('every FROM / INTO / UPDATE / JOIN names a live table', () => {
    const unknown = unknownTables(files, live)
    expect(
      [...unknown].map(([t, fs]) => `${t} ← ${fs.join(', ')}`),
      'a handler names a table no migration leaves standing — it would fail at run time, for whoever pressed the button',
    ).toEqual([])
  })
})
