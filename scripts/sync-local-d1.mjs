// Keep the local D1 sqlite files in sync after a migration.
//
// WHY THIS EXISTS: `wrangler d1 migrations apply --local` and `wrangler pages
// dev` BOTH read the same D1 binding from wrangler.toml, but each derives a
// DIFFERENT local sqlite filename from it (a wrangler quirk). So a migration
// lands in the CLI's file while `pages dev` keeps reading its own — leaving the
// dev server on a stale/empty schema and surfacing as `no such column` / 500s.
//
// This copies the canonical (most-migrated) DB onto every other local D1 file,
// so whichever file `pages dev` happens to use is always current. It runs
// automatically after `npm run db:migrate:local`.
//
// CANONICAL = the file with the MOST applied migrations (read from each file's
// own `d1_migrations` table), breaking ties by size then mtime. Counting
// migrations — not "newest mtime" — is deliberate: a running dev server writes
// heartbeats to its (stale) file, which would make a non-migrated file look
// "newest" and cause this script to copy the OLD schema over the new one.
//
// Requires Node's experimental sqlite (run via `node --experimental-sqlite`).

import { readdirSync, statSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const D1_DIR = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
const SIDECARS = ['-wal', '-shm']

// Read a file's migration state. Checkpoints first so any WAL contents are
// folded into the main file (then a plain file copy is a consistent snapshot).
function inspect(path) {
  let migrations = 0
  let lastMigration = ''
  let hasPostal = false
  try {
    const db = new DatabaseSync(path)
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      /* nothing to checkpoint */
    }
    try {
      const rows = db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()
      migrations = rows.length
      lastMigration = rows.length ? rows[rows.length - 1].name : ''
    } catch {
      /* no d1_migrations table -> 0 */
    }
    try {
      hasPostal = db
        .prepare("SELECT 1 FROM pragma_table_info('households') WHERE name = 'postal_code'")
        .all().length > 0
    } catch {
      /* households may not exist yet */
    }
    db.close()
  } catch (err) {
    return { path, ok: false, error: err.message }
  }
  const { size, mtimeMs } = statSync(path)
  return { path, ok: true, migrations, lastMigration, hasPostal, size, mtimeMs }
}

function syncMain(srcPath, dstPath) {
  copyFileSync(srcPath, dstPath)
  // Source was checkpointed (WAL truncated), so the main file is complete.
  // Drop any stale sidecars on the target or it could read inconsistent state.
  for (const ext of SIDECARS) {
    if (existsSync(dstPath + ext)) rmSync(dstPath + ext)
  }
}

function main() {
  if (!existsSync(D1_DIR)) {
    console.log('[sync-local-d1] No local D1 dir yet — run `npm run db:migrate:local` first.')
    return
  }

  const files = readdirSync(D1_DIR)
    .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    .map((f) => inspect(join(D1_DIR, f)))

  const ok = files.filter((f) => f.ok)
  if (ok.length === 0) {
    console.log('[sync-local-d1] No readable D1 files (is a dev server still holding them open?).')
    return
  }
  for (const f of files.filter((f) => !f.ok)) {
    console.warn(`[sync-local-d1] skip ${name(f.path)}: ${f.error}`)
  }
  if (ok.length === 1) {
    console.log(`[sync-local-d1] 1 D1 file (${ok[0].migrations} migrations) — nothing to sync.`)
    return
  }

  // Canonical: most migrations, then biggest, then newest.
  ok.sort((a, b) => b.migrations - a.migrations || b.size - a.size || b.mtimeMs - a.mtimeMs)
  const [source, ...targets] = ok
  console.log(
    `[sync-local-d1] source: ${name(source.path)} ` +
      `(${source.migrations} migrations${source.lastMigration ? ', last ' + source.lastMigration : ''}, ` +
      `postal_code=${source.hasPostal})`,
  )

  let synced = 0
  for (const t of targets) {
    try {
      syncMain(source.path, t.path)
      synced++
      console.log(`[sync-local-d1]   -> ${name(t.path)} (was ${t.migrations} migrations)`)
    } catch (err) {
      console.warn(
        `[sync-local-d1]   !! could not write ${name(t.path)}: ${err.message}\n` +
          '     Stop `wrangler pages dev` and re-run `npm run db:sync:local`.',
      )
    }
  }
  console.log(`[sync-local-d1] done — ${synced}/${targets.length} synced.`)
}

const name = (p) => p.split(/[/\\]/).pop().slice(0, 12)

main()
