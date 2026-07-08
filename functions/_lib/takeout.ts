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

const EXCLUDE = new Set([
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

export async function dumpHousehold(env: Env, householdId: string): Promise<Takeout> {
  const master = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'",
  ).all<{ name: string }>()

  const tables: Record<string, Row[]> = {}
  const skipped: string[] = []
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

  for (const { name } of (master.results ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
    // Table names come from sqlite_master (our own migrations), but never
    // interpolate anything that isn't a plain identifier.
    if (!/^[A-Za-z0-9_]+$/.test(name) || EXCLUDE.has(name)) continue
    try {
      let rows: Row[]
      if (CUSTOM[name]) {
        rows = ((await env.DB.prepare(CUSTOM[name]).bind(householdId).all<Row>()).results ?? [])
      } else {
        const info = await env.DB.prepare(`PRAGMA table_info(${name})`).all<{ name: string }>()
        const cols = new Set((info.results ?? []).map((c) => c.name))
        if (cols.has('household_id')) {
          rows = ((await env.DB.prepare(`SELECT * FROM ${name} WHERE household_id = ?1`).bind(householdId).all<Row>()).results ?? [])
        } else if (VIA_PARENT[name]) {
          const { parent, fk } = VIA_PARENT[name]
          rows = ((
            await env.DB.prepare(`SELECT * FROM ${name} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE household_id = ?1)`)
              .bind(householdId)
              .all<Row>()
          ).results ?? [])
        } else {
          skipped.push(name)
          continue
        }
      }
      tables[name] = rows
      collectMedia(name, rows)
    } catch {
      // A table the scan can't read (odd PRAGMA, transient) must not sink the
      // whole export — record it and keep going.
      skipped.push(name)
    }
  }

  const household =
    ((await env.DB.prepare('SELECT * FROM households WHERE id = ?1').bind(householdId).all<Row>()).results ?? [])[0] ?? null

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
