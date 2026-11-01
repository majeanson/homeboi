// « Mon journal » — the private address a handwritten page arrives at.
//
// One row per live inbox (migration 0146). The address is `jrnl-<id>@<domain>`, where
// `id` is the table's primary key, so resolving an incoming mail is one indexed lookup
// and revoking an address is one UPDATE.
//
// Why a row and not a signed token is written out in 0146's header, and it is worth
// knowing before you refactor it back: an email local-part is capped at 64 characters
// and one of this repo's HMAC tokens is ~124 on its own. The table is not a shortcut
// around auth — it IS the credential store, and `revoked_at` is the thing a stateless
// token could not give us without rotating SESSION_SECRET and signing every operator
// and paired device out.

import type { Env } from './env'
import { newShortCode, nowSec } from './ids'

/** The local-part prefix. Short, lowercase, and obviously not a person's name. */
export const JOURNAL_PREFIX = 'jrnl-'

// ~79 bits over newShortCode's 31-symbol lowercase alphabet. The length matters for
// two reasons at once: long enough that the address cannot be guessed (it is an
// unauthenticated write door — see journalIngest.ts), and short enough that
// `jrnl-` + 16 + `@` + a domain stays well inside the 64-character local-part bound.
const ID_LEN = 16

export interface JournalInbox {
  id: string
  householdId: string
  /** Whose journal. NULL/null = the Maisonnée's. */
  memberId: string | null
}

/**
 * The full address, or `null` when inbound mail is not configured.
 *
 * `JOURNAL_MAIL_DOMAIN` is an OPTIONAL binding, like AI and R2: unset means the
 * feature hides rather than half-works (the Réglages card says so and offers nothing
 * to copy). Nothing else in the app changes.
 */
export function journalAddress(env: Env, id: string): string | null {
  const domain = env.JOURNAL_MAIL_DOMAIN?.trim()
  if (!domain) return null
  return `${JOURNAL_PREFIX}${id}@${domain}`
}

/** True when the household can be given an address at all. */
export const journalMailEnabled = (env: Env): boolean => !!env.JOURNAL_MAIL_DOMAIN?.trim()

/**
 * Pull the inbox id out of a recipient address.
 *
 * Lowercased on the way in because mail servers normalise the local part in transit —
 * that is also why the stored ids are generated from a lowercase alphabet (0146). The
 * domain is NOT checked here: Email Routing only delivers mail for the zone it is
 * configured on, so re-checking it would mean duplicating that config in two places and
 * breaking the day the zone changes.
 */
export function inboxIdFromAddress(address: string | null | undefined): string | null {
  const at = (address ?? '').trim().toLowerCase()
  const local = at.split('@')[0] ?? ''
  if (!local.startsWith(JOURNAL_PREFIX)) return null
  const id = local.slice(JOURNAL_PREFIX.length)
  // Shape check before touching D1: the alphabet is lowercase letters + digits, so
  // anything else is a probe, not a typo worth a query.
  return /^[a-z0-9]{8,32}$/.test(id) ? id : null
}

/** Resolve a recipient address to its household + member, or null. */
export async function resolveJournalInbox(env: Env, address: string | null | undefined): Promise<JournalInbox | null> {
  const id = inboxIdFromAddress(address)
  if (!id) return null
  const row = await env.DB.prepare(
    'SELECT id, household_id, member_id FROM journal_inboxes WHERE id = ? AND revoked_at IS NULL',
  )
    .bind(id)
    .first<{ id: string; household_id: string; member_id: string | null }>()
  return row ? { id: row.id, householdId: row.household_id, memberId: row.member_id } : null
}

/**
 * The household's live inbox for one face, minting it on first ask.
 *
 * `member_id IS ?` rather than `= ?` so a NULL bind matches the Maisonnée's row —
 * SQLite's `IS` is null-safe where `=` yields NULL and silently matches nothing. That
 * mistake would have minted a second Maisonnée inbox on every single read, which the
 * partial unique index in 0146 would then have rejected.
 */
export async function getOrCreateJournalInbox(
  env: Env,
  householdId: string,
  memberId: string | null,
): Promise<string> {
  const live = await env.DB.prepare(
    'SELECT id FROM journal_inboxes WHERE household_id = ? AND member_id IS ? AND revoked_at IS NULL',
  )
    .bind(householdId, memberId)
    .first<{ id: string }>()
  if (live) return live.id

  // Retry on the (vanishingly rare) primary-key collision, exactly as newShortCode's
  // own header prescribes for the /tv code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newShortCode(ID_LEN)
    try {
      await env.DB.prepare(
        'INSERT INTO journal_inboxes (id, household_id, member_id, created_at) VALUES (?, ?, ?, ?)',
      )
        .bind(id, householdId, memberId, nowSec())
        .run()
      return id
    } catch {
      // Either the id collided, or another request minted this face's inbox between
      // our SELECT and our INSERT (the unique index catching a race). Re-read: if a
      // row now exists, it is the answer.
      const raced = await env.DB.prepare(
        'SELECT id FROM journal_inboxes WHERE household_id = ? AND member_id IS ? AND revoked_at IS NULL',
      )
        .bind(householdId, memberId)
        .first<{ id: string }>()
      if (raced) return raced.id
    }
  }
  throw new Error('journal inbox: could not mint an id')
}

/**
 * Revoke this face's address and mint a new one — « l'adresse a fuité ».
 *
 * The old row is kept (soft revoke) rather than deleted, so a mail still arriving at
 * the retired address resolves to nothing and is dropped, instead of resolving to
 * whoever is minted next.
 */
export async function rotateJournalInbox(env: Env, householdId: string, memberId: string | null): Promise<string> {
  await env.DB.prepare(
    'UPDATE journal_inboxes SET revoked_at = ? WHERE household_id = ? AND member_id IS ? AND revoked_at IS NULL',
  )
    .bind(nowSec(), householdId, memberId)
    .run()
  return getOrCreateJournalInbox(env, householdId, memberId)
}
