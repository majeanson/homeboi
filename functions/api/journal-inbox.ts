import { ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { profileMemberId } from '../_lib/profile'
import {
  getOrCreateJournalInbox,
  journalAddress,
  journalMailEnabled,
  rotateJournalInbox,
} from '../_lib/journalInbox'

// « Mon journal » — the private address a handwritten page is mailed to
// (migration 0146, plans/JOURNAL-EWRITER.md).
//
//   GET  /api/journal-inbox  -> { address: string | null }   the picked face's live address
//   POST /api/journal-inbox  -> { address }                  mint it, or { rotate: true } to replace it
//
// OPERATOR-SCOPED, both verbs. The address is a write credential for the household —
// anything that learns it can post notes — so a paired kiosk on the kitchen wall has no
// business displaying it, and `authed(…, 'operator')` is the structural way to say that
// rather than a check inside the handler. A link guest is refused by the same wrapper.
//
// Minting is a POST, not a side effect of the GET. A read that writes would mint a row
// for every household that ever opens this Réglages card out of curiosity; making it an
// action means the table only holds addresses somebody asked for. It also gives the UI
// an honest button to show instead of an address that silently appeared.

export const onRequestGet = authed(async (ctx, actor) => {
  // Inbound mail unconfigured (JOURNAL_MAIL_DOMAIN unset) is NOT an error — it is the
  // optional-binding contract this app uses everywhere (AI, R2, the DO): answer
  // honestly and let the card explain itself. Any address already minted stays in the
  // table and starts working the day the domain is set.
  if (!journalMailEnabled(ctx.env)) return ok({ address: null, enabled: false })

  const memberId = profileMemberId(ctx.request)
  const row = await ctx.env.DB.prepare(
    'SELECT id FROM journal_inboxes WHERE household_id = ? AND member_id IS ? AND revoked_at IS NULL',
  )
    .bind(actor.householdId, memberId)
    .first<{ id: string }>()

  return ok({ address: row ? journalAddress(ctx.env, row.id) : null, enabled: true })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  if (!journalMailEnabled(ctx.env))
    return serviceUnavailable('Le courriel entrant n’est pas configuré.')

  const body = await readJson<{ rotate?: boolean }>(ctx.request)
  const memberId = profileMemberId(ctx.request)

  // Rotate = « l'adresse a fuité »: the old row is soft-revoked, so mail still arriving
  // at it resolves to nothing instead of to whoever is minted next.
  const id = body?.rotate
    ? await rotateJournalInbox(ctx.env, actor.householdId, memberId)
    : await getOrCreateJournalInbox(ctx.env, actor.householdId, memberId)

  return ok({ address: journalAddress(ctx.env, id) })
}, 'operator')
