// « Mon journal » — filing one received mail as one note.
//
// The seam between `email()` (which owns the Cloudflare EmailMessage and nothing else)
// and D1. It takes PARSED mail plus a resolved inbox, so it can be driven from the
// real-runtime harness (worker/*.d1.test.ts) without conjuring an EmailMessage —
// which matters because Wrangler cannot run an Email Worker locally at all.

import type { Env } from './env'
import { newId, nowSec } from './ids'
import { journalEntryFromMail, type MailInput } from './journalMail'
import type { JournalInbox } from './journalInbox'

// A FLOOD BOUND, not an accounting system — the same stance as _lib/rateLimit.ts.
//
// This is an unauthenticated write door: anyone who learns the address can post to it.
// What stops them is that the address carries ~79 bits and is revocable in one tap
// (journalInbox.ts), so a leak costs junk notes rather than data. This cap is the
// second half: it means a leaked address cannot fill D1 overnight before anyone wakes
// up and rotates it.
//
// It deliberately counts EVERY recent note for the face, not only the ingested ones,
// because family_notes carries no column saying where a row came from and inventing one
// to make a bound precise would be the wrong trade. Generous enough that a real day of
// journalling — even a long backlog of pages mailed in one sitting — never trips it.
const PER_DAY = 60

export type IngestResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'empty' | 'capped' }

/**
 * File a parsed mail into « Les notes » as this face's journal entry.
 *
 * The row is an ordinary `family_notes` note, which is the entire point of the design:
 * no journal table, no new tab, and the entry is searchable the moment it lands
 * because `SEARCH_INDEX.familyNote` already indexes title + body.
 */
export async function ingestJournalMail(env: Env, inbox: JournalInbox, mail: MailInput): Promise<IngestResult> {
  const entry = journalEntryFromMail(mail, nowSec())
  // Nothing to file: a blank or unreadable mail. Rejected rather than stored, so the
  // notes list never fills with empty rows the household has to clean up.
  if (!entry) return { ok: false, reason: 'empty' }

  // THE FACE MAY BE GONE. `journal_inboxes.member_id` is a SOFT ref by design (0146:
  // deleting a face must never delete its entries), but `family_notes.member_id` and
  // `author_member_id` both carry a real `REFERENCES members(id)`. So an address minted
  // for someone who has since been removed from the Maisonnée would make this INSERT
  // fail the foreign key — and because the only caller is a fire-and-forget email
  // handler that must never bounce, EVERY page mailed afterwards would vanish without a
  // word. Found by worker/journal.d1.test.ts; a pure test could not have seen it,
  // because the constraint only exists in a real D1.
  //
  // So the scope is verified the same way family-notes' own POST verifies it, and falls
  // back to the Maisonnée rather than dropping the entry. Moving a note to the right
  // face afterwards costs one gesture; a page that never arrived cannot be recovered.
  const scope = inbox.memberId
    ? (
        await env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
          .bind(inbox.memberId, inbox.householdId)
          .first<{ 1: number }>()
      )
      ? inbox.memberId
      : null
    : null

  const since = nowSec() - 86400
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM family_notes WHERE household_id = ? AND member_id IS ? AND deleted_at IS NULL AND created_at >= ?',
  )
    .bind(inbox.householdId, scope, since)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= PER_DAY) return { ok: false, reason: 'capped' }

  const id = newId()
  await env.DB.prepare(
    'INSERT INTO family_notes (id, household_id, member_id, author_member_id, title, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      inbox.householdId,
      // Scope AND author are the same face here. On a hand-composed note those differ
      // (you can write into the Maisonnée's list), but a journal entry arrives at one
      // face's private address, so the person whose journal it is also wrote it.
      scope,
      scope,
      entry.title,
      entry.text,
      // The day it was WRITTEN, off the mail's Date header — not the day it synced.
      // A journal is read by date, so filing a fortnight-old page under today would
      // put it where its author will never look for it.
      entry.at,
    )
    .run()

  return { ok: true, id }
}

/**
 * Everything `email()` does, minus owning the message: resolve the recipient, file it.
 * Kept here so the handler in worker/index.ts has no logic of its own to go stale.
 */
export async function handleJournalMail(
  env: Env,
  to: string,
  mail: MailInput,
  resolve: (env: Env, to: string) => Promise<JournalInbox | null>,
): Promise<IngestResult | { ok: false; reason: 'unknown-inbox' }> {
  const inbox = await resolve(env, to)
  // An address we do not know: a probe, or one that has been rotated. Dropped
  // silently — answering differently for a live address than a dead one would turn
  // this door into an oracle for guessing them.
  if (!inbox) return { ok: false, reason: 'unknown-inbox' }
  return ingestJournalMail(env, inbox, mail)
}
