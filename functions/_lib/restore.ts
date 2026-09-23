import type { Env } from './env'
import { newId } from './ids'
import { CHILD_TABLES, HOUSEHOLD_TABLES, SELF_REFS, collectMediaKeys, scopeColumn } from './demoHousehold'
import { deleteR2Blob } from './r2'
import { nowSec } from './ids'
import { TAKEOUT_EXCLUDE, type Takeout } from './takeout'

// Takeout IMPORT — the one restore door (STATE.md §4-L, item L8).
//
// The nightly cron had kept 14 dated dumps per household in R2 for months, and NOTHING
// read one back: no endpoint, no procedure, never rehearsed. A backup never restored is
// a hope. This module turns a takeout JSON (a nightly copy from R2, or the file
// « Emporter mes données » gave the household) back into the household's content:
//
//   1. validate the shape (format 1, tables of arrays of objects);
//   2. WIPE the content tables — the household's tables minus takeout's own EXCLUDE set
//      (operators, devices, guests, shares, pairing, idempotency, ai_errors, domains
//      stay: a restore replaces what the household HOLDS, not who may open it) — with
//      the same statements the sandbox sweep uses, so the two cannot drift;
//   3. ids: after the wipe, any id in the dump that still collides with a row anywhere
//      (the dump came from ANOTHER household that is still alive) makes every id fresh
//      and rewrites every soft reference by token — ids are 12 chars of a 56-letter
//      alphabet, so a token-equal scan of every string cell (JSON columns included:
//      `rotation_json` holds member ids) is exact. No collision → ids are kept, so a
//      same-household restore keeps the device preferences that remember a face;
//   4. INSERT with the intersection of the dump's keys and the live table's columns (a
//      backup from before a migration gets defaults; a dropped column is ignored),
//      parents before children, self-references (carnets.parent_id, mots.reply_to) in a
//      second pass; the household row's preference columns are updated, its identity
//      (id, tier, status, created_at, invite_nonce) kept;
//   5. R2 keys are NOT remapped: the blobs are still there for a same-household
//      restore, and a cross-household one keeps working while the source lives.
//
// Statements go out in chunked D1 batches (each batch is one transaction). A failure
// mid-way therefore CAN leave the household half-restored — the recovery is to run the
// same restore again (it wipes first), and the nightly copy is never touched by this.

export const MAX_RESTORE_BYTES = 20 * 1024 * 1024
export const BATCH = 40

// The households row's identity: never overwritten by a restore.
export const HOUSEHOLD_KEEP: ReadonlySet<string> = new Set(['id', 'tier', 'status', 'stripe_customer_id', 'created_at', 'invite_nonce'])

// The columns that name a household on a row, rewritten from the dump's household to
// the target's (a no-op on a same-household restore).
const HOUSEHOLD_COLUMNS = ['household_id', 'owner_household_id', 'author_household_id', 'source_household_id'] as const

// The content tables, in DELETE order (children → parents); INSERT runs it reversed.
export const CONTENT_TABLES: readonly string[] = HOUSEHOLD_TABLES.filter((t) => !TAKEOUT_EXCLUDE.has(t))

// Foreign keys from a table the wipe KEEPS into one it DELETES. D1 enforces REFERENCES
// and a batch is one transaction, so one such row rolls the WHOLE wipe back: a family
// whose AI once failed while a face was picked could neither restore nor start over
// (found 2026-09-23 by reviewing the reset; the restore had carried it since L8). Each
// is nulled before its parent goes — the row stays, detached. worker/reset.d1.test.ts
// reads every foreign key off the live schema and fails when one is missing here.
export const KEPT_REFS: ReadonlyArray<readonly [table: string, column: string, parent: string]> = [
  ['ai_errors', 'profile', 'members'],
]

// The wipe of a set of content tables, with the sweep's statements (kept rows detached
// and self-references nulled first, children through their parent, rows other
// households left on a trip this one owns) — ONE builder for the restore and
// « Repartir à neuf », so the two wipes cannot drift. `tables` must be a subset of
// CONTENT_TABLES, in its order.
export function wipeStatements(env: Env, householdId: string, tables: readonly string[]): D1PreparedStatement[] {
  const P = env.DB.prepare.bind(env.DB)
  const set = new Set(tables)
  return [
    ...KEPT_REFS.filter(([, , parent]) => set.has(parent)).map(([t, c]) => P(`UPDATE ${t} SET ${c} = NULL WHERE ${scopeColumn(t)} = ? AND ${c} IS NOT NULL`).bind(householdId)),
    ...SELF_REFS.filter(([t]) => set.has(t)).map(([t, c]) => P(`UPDATE ${t} SET ${c} = NULL WHERE ${scopeColumn(t)} = ? AND ${c} IS NOT NULL`).bind(householdId)),
    ...CHILD_TABLES.filter(([, , parent]) => set.has(parent)).map(([t, fk, parent]) =>
      P(`DELETE FROM ${t} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE ${scopeColumn(parent)} = ?)`).bind(householdId),
    ),
    ...(set.has('shared_trips')
      ? ['shared_trip_members', 'shared_trip_notes', 'shared_trip_packing'].map((t) =>
          P(`DELETE FROM ${t} WHERE shared_trip_id IN (SELECT id FROM shared_trips WHERE owner_household_id = ?)`).bind(householdId),
        )
      : []),
    ...tables.map((t) => P(`DELETE FROM ${t} WHERE ${scopeColumn(t)} = ?`).bind(householdId)),
  ]
}

// « Repartir à neuf » (2026-09-23): everything the household HOLDS goes; who may OPEN
// it stays — the restore's own line (TAKEOUT_EXCLUDE: the account, paired devices,
// guest and share links, pairing codes), because a family starting over should not
// have to re-pair the wall tablet. Two content tables survive on top of that, each for
// a reason the restore does not have (it puts both back from the dump):
//   · household_preferences — the settings. « Start over » is about the content, and
//     the households row's own preference columns are never touched either;
//   · usage_daily — the day's AI/R2 spend (0137). A reset must not refill the budget.
export const RESET_KEEP: ReadonlySet<string> = new Set(['household_preferences', 'usage_daily'])
export const RESET_TABLES: readonly string[] = CONTENT_TABLES.filter((t) => !RESET_KEEP.has(t))

// Unlike the restore, the blobs are freed too: nothing will point at them again. The
// keys are collected from the rows BEFORE the rows go, but the blobs are deleted only
// AFTER the batch commits — the opposite of deleteHousehold, on purpose: that household
// is gone either way, while this one lives on, and a failed wipe must leave its photos
// where its rows still point. One batch, one transaction: never left half done.
export async function resetHouseholdContent(env: Env, householdId: string): Promise<void> {
  const blobKeys = await collectMediaKeys(env, householdId).catch(() => [] as string[])
  await env.DB.batch([
    ...wipeStatements(env, householdId, RESET_TABLES),
    env.DB.prepare('UPDATE households SET updated_at = ? WHERE id = ?').bind(nowSec(), householdId),
  ])
  for (const key of blobKeys) await deleteR2Blob(env.PHOTOS, key)
}

export type Row = Record<string, unknown>

export function validateTakeout(x: unknown): { ok: true; takeout: Takeout } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'not an object' }
  const t = x as Partial<Takeout>
  if (t.format !== 1) return { ok: false, error: 'unknown format' }
  if (typeof t.householdId !== 'string' || !t.householdId) return { ok: false, error: 'no householdId' }
  if (!t.tables || typeof t.tables !== 'object' || Array.isArray(t.tables)) return { ok: false, error: 'no tables' }
  for (const [name, rows] of Object.entries(t.tables)) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) return { ok: false, error: `bad table name ${name}` }
    if (!Array.isArray(rows)) return { ok: false, error: `table ${name} is not an array` }
    for (const r of rows) if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, error: `table ${name} holds a non-row` }
  }
  if (t.household != null && (typeof t.household !== 'object' || Array.isArray(t.household))) return { ok: false, error: 'bad household row' }
  return { ok: true, takeout: t as Takeout }
}

// Every row id in the dump (strings only, the id column).
export function idsIn(t: Takeout): string[] {
  const out = new Set<string>()
  for (const rows of Object.values(t.tables)) for (const r of rows) if (typeof r.id === 'string' && r.id.length >= 8) out.add(r.id)
  return [...out]
}

// Fresh ids of the same length for every id in the dump.
export function freshIdMap(ids: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const id of ids) map.set(id, newId(id.length))
  return map
}

// Rewrite every mapped token in every string cell — plain columns AND JSON text.
export function rewriteIds(rows: Row[], map: Map<string, string>): Row[] {
  if (map.size === 0) return rows
  const re = /[A-Za-z0-9]{8,32}/g
  const sub = (s: string) => s.replace(re, (tok) => map.get(tok) ?? tok)
  return rows.map((r) => {
    const out: Row = {}
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'string' ? sub(v) : v
    return out
  })
}

// Keep only the columns the live table has; the household columns re-pointed.
export function fitRow(row: Row, live: Set<string>, fromHousehold: string, toHousehold: string): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (!live.has(k)) continue
    out[k] = (HOUSEHOLD_COLUMNS as readonly string[]).includes(k) && v === fromHousehold ? toHousehold : v
  }
  return out
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export interface RestoreSummary {
  tables: number
  rows: number
  remapped: boolean
  skippedTables: string[]
}

export async function restoreHousehold(env: Env, householdId: string, takeout: Takeout): Promise<RestoreSummary> {
  const P = env.DB.prepare.bind(env.DB)
  const from = takeout.householdId
  const selfRefTables = new Map(SELF_REFS.map(([t, c]) => [t, c]))
  const childSet = new Set(CHILD_TABLES.map(([t]) => t))
  const contentSet = new Set(CONTENT_TABLES)

  // 1. Which dump tables can land, and their live columns.
  const live = new Map<string, Set<string>>()
  const skippedTables: string[] = []
  for (const name of Object.keys(takeout.tables)) {
    if (!contentSet.has(name) && !childSet.has(name)) {
      skippedTables.push(name)
      continue
    }
    const info = await P(`PRAGMA table_info(${name})`).all<{ name: string }>()
    const cols = new Set((info.results ?? []).map((c) => c.name))
    if (cols.size === 0) skippedTables.push(name)
    else live.set(name, cols)
  }

  // 2. Wipe the content (the sweep's statements, minus the identity tables).
  await runBatches(env, wipeStatements(env, householdId, CONTENT_TABLES))

  // 3. Ids: collide with anything still alive? Then everything gets a fresh id.
  const ids = idsIn(takeout)
  let remapped = false
  outer: for (const [name] of live) {
    const own = (takeout.tables[name] ?? []).map((r) => r.id).filter((v): v is string => typeof v === 'string')
    for (const part of chunk(own, 50)) {
      const q = `SELECT id FROM ${name} WHERE id IN (${part.map(() => '?').join(',')})`
      const hit = await P(q).bind(...part).first<{ id: string }>()
      if (hit) {
        remapped = true
        break outer
      }
    }
  }
  const map = remapped ? freshIdMap(ids) : new Map<string, string>()

  // 4. Insert, parents first. Shared trips: only the ones this household OWNS; their
  //    children only for trips that will exist.
  const order = [...[...CONTENT_TABLES].reverse(), ...CHILD_TABLES.map(([t]) => t)].filter((t) => live.has(t))
  const ownedTrips = new Set<string>()
  const statements: D1PreparedStatement[] = []
  const selfRefFixes: D1PreparedStatement[] = []
  let rowCount = 0
  for (const name of order) {
    const cols = live.get(name)!
    let rows = rewriteIds(takeout.tables[name] ?? [], map)
    if (name === 'shared_trips') {
      rows = rows.filter((r) => r.owner_household_id === from)
      for (const r of rows) if (typeof r.id === 'string') ownedTrips.add(r.id)
    } else if (name === 'shared_trip_members' || name === 'shared_trip_notes' || name === 'shared_trip_packing') {
      const tripIds = [...new Set(rows.map((r) => r.shared_trip_id).filter((v): v is string => typeof v === 'string'))]
      const alive = new Set<string>(ownedTrips)
      for (const part of chunk(tripIds.filter((id) => !alive.has(id)), 50)) {
        const found = await P(`SELECT id FROM shared_trips WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all<{ id: string }>()
        for (const r of found.results ?? []) alive.add(r.id)
      }
      rows = rows.filter((r) => typeof r.shared_trip_id === 'string' && alive.has(r.shared_trip_id))
    }
    const selfRef = selfRefTables.get(name)
    for (const raw of rows) {
      const row = fitRow(raw, cols, from, householdId)
      if (selfRef && row[selfRef] != null) {
        selfRefFixes.push(P(`UPDATE ${name} SET ${selfRef} = ? WHERE id = ?`).bind(row[selfRef], row.id))
        row[selfRef] = null
      }
      const keys = Object.keys(row)
      if (!keys.length) continue
      statements.push(P(`INSERT INTO ${name} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => row[k] as never)))
      rowCount++
    }
  }
  await runBatches(env, statements)
  await runBatches(env, selfRefFixes)

  // 5. The household row's preferences (never its identity).
  if (takeout.household) {
    const info = await P('PRAGMA table_info(households)').all<{ name: string }>()
    const cols = new Set((info.results ?? []).map((c) => c.name))
    const sets: string[] = []
    const vals: unknown[] = []
    for (const [k, v] of Object.entries(takeout.household)) {
      if (!cols.has(k) || HOUSEHOLD_KEEP.has(k)) continue
      sets.push(`${k} = ?`)
      vals.push(v)
    }
    // `updated_at` rides the dump like every other preference — a restore puts the row
    // back AS IT WAS, and stamping "now" here would make a same-household restore
    // differ from its own copy by one column (caught by worker/restore.d1.test.ts's
    // byte-for-byte assertion, which is the guarantee worth having).
    if (sets.length) await P(`UPDATE households SET ${sets.join(', ')} WHERE id = ?`).bind(...(vals as never[]), householdId).run()
  }

  return { tables: live.size, rows: rowCount, remapped, skippedTables }
}

async function runBatches(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  for (const part of chunk(statements, BATCH)) if (part.length) await env.DB.batch(part)
}
