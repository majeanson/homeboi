import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// THE SCHEMA, REPLAYED — one reader of the migrations for every guard that needs to know
// which tables exist. The migrations are forward-only (CLAUDE.md), so the live schema is
// what you get by walking them in filename order: CREATE adds a table, DROP removes it,
// RENAME moves it. Two guards had grown their own copy of this walk; a third was about to.

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

/** Every migration's SQL, in filename order, `--` comment lines removed. */
export const ddl: string = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

/** The tables that exist after every migration has run, in filename order. */
export function liveTables(): Set<string> {
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
