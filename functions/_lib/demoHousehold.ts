// « Essaie pour vrai » — the per-visitor demo SANDBOX (the interactive demo
// demo.ts always deferred). Each visitor gets a THROWAWAY household of their own:
// a real operator session into a real seeded household, so every surface writes
// exactly like production — no new auth mode, no writable-guest scope. The two
// bounds that make it safe:
//
//   1. The operator email is `demo-<householdId>@babillard.invalid` — RFC 2606
//      reserved, never collides with a signup, and its random password is never
//      stored anywhere readable. The 30-day session cookie is NOT the lifetime:
//      the sweep deleting the operators row is the kill switch (requireActor
//      resolves email → operators; once the row is gone the session 401s and the
//      SPA falls back to the marketing door).
//   2. Every mint runs a bounded opportunistic sweep (the todos sweepStale
//      pattern) deleting expired sandboxes, and a CAP falls back to the legacy
//      read-only singleton when too many sandboxes are alive (free-tier polling
//      budget — see the free-tier capacity note).
//
// Deleting a household is the hard part, and it is THE reason this file exists:
// unlike clearSampleData (is_sample rows only), a sandbox holds arbitrary
// visitor-created rows in ANY table. The inventory below must therefore cover
// EVERY table in the schema — `demoHousehold.test.ts` scans the migrations and
// fails the build if a new CREATE TABLE isn't accounted for here, the same
// structural-guard pattern as calm-tenets.test.ts.

import type { Env } from './env'
import { deleteR2Blob } from './r2'

export const DEMO_SANDBOX_DOMAIN = '@babillard.invalid'
export const DEMO_SANDBOX_PREFIX = 'demo-'
// LIKE pattern for sandbox operators. The legacy read-only singleton is
// `demo@babillard.invalid` (no dash) and deliberately does NOT match.
const SANDBOX_EMAIL_LIKE = `${DEMO_SANDBOX_PREFIX}%${DEMO_SANDBOX_DOMAIN}`

export function sandboxEmail(householdId: string): string {
  return `${DEMO_SANDBOX_PREFIX}${householdId}${DEMO_SANDBOX_DOMAIN}`
}

// The pure mirror of SANDBOX_EMAIL_LIKE — "is this operator a sweepable sandbox?".
// The sweep + cap query key on the operators.email LIKE pattern and NOTHING else
// (no column, no household flag), so « Garder ma maisonnée » (demo/claim.ts)
// converts a sandbox into a real account by rewriting that one email in place:
// once it no longer matches, the household is invisible to the sweep and stops
// counting against the cap. demoHousehold.test.ts pins that a claimed email
// falls outside the pattern. The legacy singleton `demo@babillard.invalid`
// (no dash) deliberately does not match either.
export function isSandboxEmail(email: string): boolean {
  return email.startsWith(DEMO_SANDBOX_PREFIX) && email.endsWith(DEMO_SANDBOX_DOMAIN)
}

// One afternoon of real use; after this the next mint sweeps the household away.
export const DEMO_SANDBOX_TTL = 24 * 3600
// Alive-sandbox ceiling: past it new visitors get the read-only singleton
// instead. Sized against the free-tier polling budget (~15–30 households total):
// sandboxes are transient, but each open board polls like a real one.
export const DEMO_SANDBOX_CAP = 10

// ---- Schema inventory (guarded by demoHousehold.test.ts) --------------------

// Self-referencing FKs that must be nulled before the bulk DELETE — SQLite checks
// FKs per row, so a parent row deleted before its child row in the SAME statement
// still violates. (clearSampleData dodges this by seeding only flat carnets; a
// visitor can nest one.)
const SELF_REFS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['carnets', 'parent_id'],
  ['mots', 'reply_to'],
]

// Child tables WITHOUT a household_id column, deleted via their parent's ids.
export const CHILD_TABLES: ReadonlyArray<readonly [table: string, fk: string, parent: string]> = [
  ['task_participants', 'task_id', 'tasks'],
  ['routine_runs', 'routine_id', 'routines'],
  ['habit_marks', 'habit_id', 'habits'],
  ['habit_days', 'habit_id', 'habits'],
  ['contact_group_members', 'group_id', 'contact_groups'],
]

// Tables WITH household_id, in FK-safe DELETE order (children before parents —
// same discipline as SAMPLE_TABLES, superset). members and recipes are the
// most-referenced content parents, so they sit at the end of the content block;
// the household plumbing (devices/guests/operators) follows.
export const HOUSEHOLD_TABLES: readonly string[] = [
  // cercle content children → parents
  'contact_links',
  'contact_photos',
  'recipe_loves',
  'mots',
  'care_log',
  'home_pins',
  'home_projects',
  'pets',
  'contacts',
  'contact_groups',
  'businesses',
  'carnets',
  // trips (private) + the shared-trip capability rows this household owns/joined.
  // shared_trip_* also get an extra shared_trip_id sweep below (rows OTHER
  // households left on a sandbox-owned shared trip would block the FK).
  'trip_notes',
  'trip_packing',
  'trips',
  'shared_trip_members',
  'shared_trip_notes',
  'shared_trip_packing',
  'shared_trips',
  // kitchen
  'meal_leftovers',
  'meals',
  'meal_ideas',
  'pantry_low',
  'pantry_use_soon',
  'pantry_reserve',
  'ghost_items',
  'purchase_log',
  // board & routines
  'events',
  'tasks',
  'list_items',
  'notes',
  'day_notes',
  'todos',
  'todo_templates',
  'routine_stickers',
  'routines',
  'schedule_blocks',
  'car_day',
  'drawings',
  'photos',
  'captures',
  'ai_errors',
  'family_notes',
  'habits',
  // most-referenced content parents last
  'recipes',
  'members',
  // guest/share plumbing
  'staged_media',
  'intake_media',
  'postbox_media',
  'intake_submissions',
  'postbox_submissions',
  'shares',
  'family_shares',
  'guests',
  // device/account plumbing (pairing_codes references devices → before it)
  'pairing_codes',
  'devices',
  'idempotency_keys',
  'household_preferences',
  'household_domains',
  'operators',
] as const

// Tables the sweep deliberately does NOT touch, with the why — the test requires
// every migration table to appear in exactly one of the three sets.
export const EXEMPT_TABLES: Readonly<Record<string, string>> = {
  households: 'deleted explicitly by id as the final statement',
  contact_links_new: 'transient 0050 rebuild table, renamed away in the same migration',
}

// ---- R2 blob inventory ------------------------------------------------------
// R2 keys are flat `<prefix>_<id>` (no household namespace), so blobs must be
// collected from the DB BEFORE the rows go. Best-effort, like deleteR2Blob
// itself: a missed key is an orphan blob, never a failed sweep. Known skip:
// shares/family_shares snapshot JSON can embed copied `fs_` keys — parsing those
// snapshots here isn't worth it for a 24 h sandbox (they expire with the share).
const MEDIA_SCALAR_COLUMNS: ReadonlyArray<readonly [table: string, columns: readonly string[]]> = [
  ['notes', ['media_key', 'scene_key']],
  ['family_notes', ['media_key', 'scene_key']],
  ['mots', ['media_key', 'scene_key']],
  ['drawings', ['media_key', 'scene_key']],
  ['trip_notes', ['media_key', 'scene_key']],
  ['postbox_media', ['media_key', 'scene_key']],
  ['photos', ['media_key']],
  ['contacts', ['media_key']],
  ['contact_photos', ['media_key']],
  ['businesses', ['media_key']],
  ['pets', ['media_key']],
  ['carnets', ['media_key']],
  ['home_pins', ['media_key']],
  ['trips', ['media_key']],
  ['intake_media', ['media_key']],
  ['staged_media', ['media_key']],
]
// JSON arrays of keys (the DB-1 parallel-array shapes) — entries may be null/''.
const MEDIA_JSON_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['routines', 'cards_narration_json'],
  ['routines', 'cards_photo_json'],
  ['recipes', 'steps_images_json'],
  ['care_log', 'media_json'],
]

async function collectMediaKeys(env: Env, householdId: string): Promise<string[]> {
  const keys = new Set<string>()
  for (const [table, columns] of MEDIA_SCALAR_COLUMNS) {
    const cols = columns.join(', ')
    const { results } = await env.DB.prepare(`SELECT ${cols} FROM ${table} WHERE household_id = ?`)
      .bind(householdId)
      .all<Record<string, string | null>>()
    for (const row of results) for (const c of columns) if (row[c]) keys.add(row[c] as string)
  }
  for (const [table, column] of MEDIA_JSON_COLUMNS) {
    const { results } = await env.DB.prepare(
      `SELECT ${column} AS v FROM ${table} WHERE household_id = ? AND ${column} IS NOT NULL`,
    )
      .bind(householdId)
      .all<{ v: string }>()
    for (const row of results) {
      try {
        for (const k of JSON.parse(row.v) as unknown[]) if (typeof k === 'string' && k) keys.add(k)
      } catch {
        /* malformed JSON — nothing to free */
      }
    }
  }
  // members photo avatars (avatar_ref is a colour unless avatar_kind='photo')
  const { results: avatars } = await env.DB.prepare(
    "SELECT avatar_ref AS v FROM members WHERE household_id = ? AND avatar_kind = 'photo' AND avatar_ref != ''",
  )
    .bind(householdId)
    .all<{ v: string }>()
  for (const row of avatars) keys.add(row.v)
  // recipes.image is an R2 key OR a full https:// URL (imports) — only free keys.
  const { results: recipeImgs } = await env.DB.prepare(
    'SELECT image AS v FROM recipes WHERE household_id = ? AND image IS NOT NULL',
  )
    .bind(householdId)
    .all<{ v: string }>()
  for (const row of recipeImgs) if (row.v && !/^https?:\/\//i.test(row.v)) keys.add(row.v)
  return [...keys]
}

// ---- The delete + the sweep -------------------------------------------------

/** Hard-delete one sandbox household: free its R2 blobs (best-effort), then every
 * row it owns across the whole schema, in one FK-safe batch. */
export async function deleteDemoHousehold(env: Env, householdId: string): Promise<void> {
  const blobKeys = await collectMediaKeys(env, householdId).catch(() => [] as string[])
  for (const key of blobKeys) await deleteR2Blob(env.PHOTOS, key)

  const P = env.DB.prepare.bind(env.DB)
  await env.DB.batch([
    ...SELF_REFS.map(([table, column]) =>
      P(`UPDATE ${table} SET ${column} = NULL WHERE household_id = ? AND ${column} IS NOT NULL`).bind(householdId),
    ),
    ...CHILD_TABLES.map(([table, fk, parent]) =>
      P(`DELETE FROM ${table} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE household_id = ?)`).bind(householdId),
    ),
    // rows OTHER households left on a sandbox-owned shared trip (their FK would
    // block deleting the shared_trips row) — swept by trip id, not household.
    ...['shared_trip_members', 'shared_trip_notes', 'shared_trip_packing'].map((table) =>
      P(`DELETE FROM ${table} WHERE shared_trip_id IN (SELECT id FROM shared_trips WHERE household_id = ?)`).bind(
        householdId,
      ),
    ),
    ...HOUSEHOLD_TABLES.map((table) => P(`DELETE FROM ${table} WHERE household_id = ?`).bind(householdId)),
    P('DELETE FROM households WHERE id = ?').bind(householdId),
  ])
}

/** How many sandbox households are currently alive (drives the mint cap). */
export async function countDemoSandboxes(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM operators WHERE email LIKE ?')
    .bind(SANDBOX_EMAIL_LIKE)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/** Opportunistic bounded sweep (the todos sweepStale stance): delete up to `limit`
 * expired sandboxes per mint, so cleanup amortizes over traffic and one request
 * never pays for a backlog. Best-effort — a sweep failure never blocks the mint. */
export async function sweepExpiredDemoSandboxes(env: Env, now: number, limit = 2): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT h.id FROM households h JOIN operators o ON o.household_id = h.id
     WHERE o.email LIKE ? AND h.created_at < ? ORDER BY h.created_at LIMIT ?`,
  )
    .bind(SANDBOX_EMAIL_LIKE, now - DEMO_SANDBOX_TTL, limit)
    .all<{ id: string }>()
  for (const row of results) {
    try {
      await deleteDemoHousehold(env, row.id)
    } catch {
      /* leave it for the next mint's sweep */
    }
  }
}
