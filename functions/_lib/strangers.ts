import type { Env } from './env'
import { localDayStart, nowSec } from './ids'
import { DEFAULT_TZ } from './tz'

// WHAT THE OPERATOR CAN SEE OF OTHER HOUSEHOLDS, and nothing more (2026-09-24).
//
// Signup opened that day. Until then every household was one Marc had invited and could
// simply ask; after it, two things went dark:
//   1. « Les remarques » is scoped per household, and its only reader (the MCP tool)
//      reads Marc's. A stranger who filed a bug was talking to themselves — while the
//      screen invites them to write « même à moitié formulé ».
//   2. The app has no analytics, on purpose, so whether strangers got through the door
//      at all was unknowable.
// Both answers go to ONE place, the nightly mail to ALERT_EMAIL (_lib/nightly.ts): no new
// login, no admin role, no endpoint to guard. The privacy policy says both in plain words
// (/confidentialite ▸ « Ce qui est gardé » and « Ce qui n'est PAS fait »).
//
// THE LINE: remarks are addressed to the maker — reading them is what they are FOR. The
// door is COUNTS: never a household's name, never an address, never a row of content.

// A household is « real » when it has an operator outside the reserved demo domain: that
// leaves out every sandbox AND the legacy read-only demo singleton (demo@babillard.invalid).
const REAL = `EXISTS (SELECT 1 FROM operators o WHERE o.household_id = h.id AND o.email NOT LIKE '%@babillard.invalid')`

export interface StrangerRemark {
  kind: string
  title: string
  body: string
  seenPath: string | null
  createdAt: number
  householdId: string
  /** Filed from a demo sandbox — the sweep will delete it; this mail is its only copy. */
  sandbox: boolean
}

/** Remarks filed in the last 24 h by households OTHER than the operator's own (the ones
 *  with an operator whose email is ALERT_EMAIL — those are read through the MCP tool).
 *  Must run BEFORE the sandbox sweep, or a visitor's remark dies with their sandbox. */
export async function recentStrangerRemarks(env: Env, now: number, limit = 20): Promise<StrangerRemark[]> {
  const own = (env.ALERT_EMAIL ?? '').trim().toLowerCase()
  const rows = await env.DB.prepare(
    `SELECT r.kind, r.title, r.body, r.seen_path, r.created_at, r.household_id,
            EXISTS (SELECT 1 FROM operators o WHERE o.household_id = r.household_id AND o.email LIKE 'demo-%@babillard.invalid') AS sandbox
       FROM remarks r
      WHERE r.created_at > ?1 AND r.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM operators o WHERE o.household_id = r.household_id AND o.email = ?2)
      ORDER BY r.created_at LIMIT ?3`,
  )
    .bind(now - 86_400, own, limit)
    .all<{ kind: string; title: string; body: string; seen_path: string | null; created_at: number; household_id: string; sandbox: number }>()
  return (rows.results ?? []).map((r) => ({
    kind: r.kind,
    title: r.title,
    body: r.body,
    seenPath: r.seen_path,
    createdAt: r.created_at,
    householdId: r.household_id,
    sandbox: !!r.sandbox,
  }))
}

// ---- The door's passing events (migration 0141) -------------------------------------
//
// What the counts BELOW cannot see, because it leaves no row behind: a trial opened (the
// sandbox is swept at 24 h), a trial KEPT (the claim rewrites the operator in place, so a
// kept demo reads exactly like a signup), a trial refused at the cap, and which of the new
// households came in by signup. Totals per day, nothing else — see the migration.
export type DoorEvent = 'demo' | 'demo_full' | 'kept' | 'signup'

// The weekly stranger walk signs up with Resend's test inboxes and deletes the household
// after; counting it would report a robot as a visitor every Monday. Its demo mint is not
// distinguishable from a visitor's (nothing identifies a request, on purpose), and the
// mail line says so.
export const isWalkerEmail = (email: string): boolean => /@resend\.dev$/i.test(email.trim())

/**
 * Count one door event for today. FAILS OPEN and never throws: a counter must not cost a
 * visitor their demo or their account. One atomic UPSERT, like usage_daily's charge.
 * The day is the DEPLOYMENT's default zone, not a household's — the door opens before
 * any household exists, and a claim running inside a sandbox's zone would split a day.
 */
export async function countDoor(env: Env, event: DoorEvent, now = nowSec()): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO door_daily (day, event, n, created_at, updated_at) VALUES (?1, ?2, 1, ?3, ?3)
       ON CONFLICT(day, event) DO UPDATE SET n = n + 1, updated_at = excluded.updated_at`,
    )
      .bind(localDayStart(new Date(now * 1000), DEFAULT_TZ), event, now)
      .run()
  } catch (err) {
    console.error('[door]', event, err)
  }
}

export interface DoorCounts {
  /** Trials opened (sandboxes minted) in the last 7 days — the weekly walk's included. */
  demos: number
  /** Visitors sent to the read-only fallback because the sandbox cap was full. */
  demosFull: number
  /** Trials KEPT (« Garder ma maisonnée »). */
  kept: number
  /** Accounts created through /signup (the weekly walk's excluded). */
  signups: number
  /** Real households created in the last 7 days (signed up, or a kept demo). */
  newHouseholds: number
  /** …of which at least one operator has confirmed an email. */
  newConfirmed: number
  /** Real households that wrote something in the last 7 days. */
  active: number
  /** Real households 3 to 14 days old with not one member: the welcome card never got
   *  past step one. The dropout number — the one a door review starts from. */
  stuckEmpty: number
}

const DAY = 86_400
// Where a household « wrote something »: the five tables every section starts from, plus
// an AI charge. A row cleared since (a checked list item) is missed — an undercount, on
// the side of saying less. One EXISTS per table, OR-ed: D1 refuses a compound SELECT of
// this many UNION terms (« too many terms », found by worker/strangers.d1.test.ts), and
// an EXISTS stops at the first row per household anyway.
const WROTE = ['list_items', 'meals', 'events', 'tasks', 'members']
  .map((t) => `EXISTS (SELECT 1 FROM ${t} x WHERE x.household_id = h.id AND x.created_at > ?1)`)
  .concat('EXISTS (SELECT 1 FROM usage_daily u WHERE u.household_id = h.id AND u.updated_at > ?1)')
  .join(' OR ')

export async function doorCounts(env: Env, now: number): Promise<DoorCounts> {
  const week = now - 7 * DAY
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM households h WHERE h.created_at > ?1 AND ${REAL}) AS new_households,
       (SELECT COUNT(*) FROM households h WHERE h.created_at > ?1 AND ${REAL}
          AND EXISTS (SELECT 1 FROM operators o WHERE o.household_id = h.id AND o.verified_at IS NOT NULL)) AS new_confirmed,
       (SELECT COUNT(*) FROM households h WHERE (${WROTE}) AND ${REAL}) AS active,
       (SELECT COUNT(*) FROM households h WHERE h.created_at BETWEEN ?2 AND ?3 AND ${REAL}
          AND NOT EXISTS (SELECT 1 FROM members m WHERE m.household_id = h.id)) AS stuck_empty,
       ${(['demo', 'demo_full', 'kept', 'signup'] as const satisfies readonly DoorEvent[])
         .map((e) => `(SELECT COALESCE(SUM(n), 0) FROM door_daily WHERE day > ?1 AND event = '${e}') AS ev_${e}`)
         .join(',\n       ')}`,
  )
    .bind(week, now - 14 * DAY, now - 3 * DAY)
    .first<{
      new_households: number
      new_confirmed: number
      active: number
      stuck_empty: number
      ev_demo: number
      ev_demo_full: number
      ev_kept: number
      ev_signup: number
    }>()
  return {
    demos: row?.ev_demo ?? 0,
    demosFull: row?.ev_demo_full ?? 0,
    kept: row?.ev_kept ?? 0,
    signups: row?.ev_signup ?? 0,
    newHouseholds: row?.new_households ?? 0,
    newConfirmed: row?.new_confirmed ?? 0,
    active: row?.active ?? 0,
    stuckEmpty: row?.stuck_empty ?? 0,
  }
}
