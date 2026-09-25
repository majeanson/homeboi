import type { Env } from './env'

// « Emporter ses données » (bmad/08 E-35) + the nightly backup (E-36) share this
// one dump: EVERY household-content table, scoped to one household, as a single
// JSON object. The scan is GENERIC — it walks sqlite_master and exports any
// table with a `household_id` column — so a new migration's table is included
// automatically (forward-proof; the schema conventions make household_id the
// rule). The few known exceptions are mapped explicitly below; anything else
// without a scope lands in `skipped` so a gap is visible, never silent.
//
// Deliberately EXCLUDED (auth/infra plumbing, not household content — and a
// leaked export file must never leak a live capability or credential):
//   operators (password hash) · devices/guests/shares/family_shares/
//   pairing_codes (token-bearing) · idempotency_keys / ai_errors /
//   household_domains / d1_migrations (machinery).
// The household's own row IS included (its preferences are their data).
//
// Media: the JSON carries a MANIFEST of R2 keys (media_key/scene_key columns +
// recipe images), not the blobs — a takeout stays one small file, and each key
// is fetchable via /api/img/<key> while the household exists. The nightly
// backup likewise stores JSON only: the blobs already live in the same R2.

// Exported: functions/_lib/restore.ts subtracts these from the sweep's table list to get
// the CONTENT tables — the ones a restore replaces. A restore must never touch who may
// OPEN the household (operators/devices/guests/shares/pairing), which is exactly the set
// a takeout refuses to export, so the two questions have one answer.
export const TAKEOUT_EXCLUDE = new Set([
  'd1_migrations',
  'households', // handled separately (single row)
  'operators',
  'devices',
  'guests',
  'shares',
  'family_shares',
  'pairing_codes',
  'idempotency_keys',
  'ai_errors',
  'household_domains',
])

// Tables scoped only through a parent (no household_id column of their own).
const VIA_PARENT: Record<string, { parent: string; fk: string }> = {
  contact_group_members: { parent: 'contact_groups', fk: 'group_id' },
  task_participants: { parent: 'tasks', fk: 'task_id' },
  routine_runs: { parent: 'routines', fk: 'routine_id' },
  // « Les remarques » (0136). Without this line the journal — every explanation, every
  // « pas réglé » note, every attachment key — is absent from each takeout AND from the
  // nightly R2 backup: it lands in `skipped`, which is visible but is not a backup.
  remark_events: { parent: 'remarks', fk: 'remark_id' },
}

// Cross-household voyage rooms (mig 0101) scope by owner_household_id, and a
// household can also PARTICIPATE in a trip it doesn't own — export both (the
// participant sees that trip + its notes in-app already).
const CUSTOM: Record<string, string> = {
  shared_trips:
    'SELECT * FROM shared_trips WHERE owner_household_id = ?1 OR id IN (SELECT shared_trip_id FROM shared_trip_members WHERE household_id = ?1)',
  shared_trip_notes:
    'SELECT * FROM shared_trip_notes WHERE shared_trip_id IN (SELECT id FROM shared_trips WHERE owner_household_id = ?1 UNION SELECT shared_trip_id FROM shared_trip_members WHERE household_id = ?1)',
}

type Row = Record<string, unknown>

export interface Takeout {
  app: string
  format: 1
  householdId: string
  exportedAt: number // unix seconds
  household: Row | null
  tables: Record<string, Row[]>
  // Tables the scan could not scope to a household (visible, never silent).
  skipped: string[]
  // R2 keys referenced by the exported rows (media_key/scene_key + recipe images).
  media: string[]
}

// D1 counts every prepare().all() as one API request, and a Worker invocation gets a
// fixed budget of them (« Too many API requests by single Worker invocation »). The
// first shape of this dump spent ~2 requests PER TABLE per household — a PRAGMA to
// learn the scope, then the SELECT — about 145 for ~72 tables. Fine for one takeout;
// the nightly cron backs up EVERY household in one invocation, and on 2026-09-25, with
// fifteen households after signup opened, it died at the ninth (Marc's own among the
// seven lost) and took the sandbox count and the door counts down with it. So:
//
//   · the PLAN — which tables, scoped how — is computed once (`planDump`): sqlite_master,
//     then ONE batch of PRAGMAs. The cron computes it once per run and hands it to every
//     household; a takeout computes its own.
//   · the ROWS come back in one `batch()` per household (chunked at BATCH_MAX, well under
//     any per-batch cap). A batch is one API request whatever it carries.
//
// A batch is atomic, so one statement D1 refuses fails the whole batch. That is the one
// property the table-at-a-time walk had that a batch does not — « a table the scan
// can't read must not sink the export » — so the walk stays as the FALLBACK, paying a
// request per table only on that exception path.
const BATCH_MAX = 50

export interface DumpPlan {
  queries: { name: string; sql: string }[]
  skipped: string[]
}

async function batched<T>(env: Env, stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
  const out: D1Result<T>[] = []
  for (let i = 0; i < stmts.length; i += BATCH_MAX) out.push(...(await env.DB.batch<T>(stmts.slice(i, i + BATCH_MAX))))
  return out
}

export async function planDump(env: Env): Promise<DumpPlan> {
  const master = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'",
  ).all<{ name: string }>()
  // Table names come from sqlite_master (our own migrations), but never interpolate
  // anything that isn't a plain identifier.
  const names = (master.results ?? [])
    .map((r) => r.name)
    .filter((name) => /^[A-Za-z0-9_]+$/.test(name) && !TAKEOUT_EXCLUDE.has(name))
    .sort((a, b) => a.localeCompare(b))
  const infos = await batched<{ name: string }>(
    env,
    names.map((name) => env.DB.prepare(`PRAGMA table_info(${name})`)),
  )
  const queries: DumpPlan['queries'] = []
  const skipped: string[] = []
  names.forEach((name, i) => {
    if (CUSTOM[name]) return queries.push({ name, sql: CUSTOM[name] })
    const cols = new Set((infos[i]?.results ?? []).map((c) => c.name))
    if (cols.has('household_id')) return queries.push({ name, sql: `SELECT * FROM ${name} WHERE household_id = ?1` })
    if (VIA_PARENT[name]) {
      const { parent, fk } = VIA_PARENT[name]
      return queries.push({ name, sql: `SELECT * FROM ${name} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE household_id = ?1)` })
    }
    skipped.push(name)
  })
  return { queries, skipped }
}

export async function dumpHousehold(env: Env, householdId: string, plan?: DumpPlan): Promise<Takeout> {
  plan ??= await planDump(env)

  const tables: Record<string, Row[]> = {}
  const skipped: string[] = [...plan.skipped]
  const media = new Set<string>()

  const collectMedia = (table: string, rows: Row[]) => {
    for (const r of rows) {
      for (const col of ['media_key', 'scene_key']) {
        const v = r[col]
        if (typeof v === 'string' && v) media.add(v)
      }
      // recipes.image holds an R2 key OR a full https:// URL — only keys are ours.
      if (table === 'recipes') {
        const img = r.image
        if (typeof img === 'string' && img && !/^https?:/i.test(img)) media.add(img)
      }
    }
  }

  const HOUSEHOLD_ROW = 'SELECT * FROM households WHERE id = ?1'
  let household: Row | null = null
  try {
    const res = await batched<Row>(env, [
      ...plan.queries.map((q) => env.DB.prepare(q.sql).bind(householdId)),
      env.DB.prepare(HOUSEHOLD_ROW).bind(householdId),
    ])
    plan.queries.forEach((q, i) => {
      const rows = res[i]?.results ?? []
      tables[q.name] = rows
      collectMedia(q.name, rows)
    })
    household = res[plan.queries.length]?.results?.[0] ?? null
  } catch {
    // The batch is atomic: one table D1 refuses (an odd PRAGMA, a transient) fails it
    // whole. Walk the plan a table at a time instead, so THAT table lands in `skipped`
    // — visible, never silent — and the rest still export.
    for (const q of plan.queries) {
      try {
        const rows = (await env.DB.prepare(q.sql).bind(householdId).all<Row>()).results ?? []
        tables[q.name] = rows
        collectMedia(q.name, rows)
      } catch {
        skipped.push(q.name)
      }
    }
    household = ((await env.DB.prepare(HOUSEHOLD_ROW).bind(householdId).all<Row>()).results ?? [])[0] ?? null
  }

  return {
    app: 'Babillard',
    format: 1,
    householdId,
    exportedAt: Math.floor(Date.now() / 1000),
    household,
    tables,
    skipped,
    media: [...media].sort(),
  }
}
