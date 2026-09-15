import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { issueOperatorInvite, OPERATOR_INVITE_TTL } from '../_lib/auth'

// « Inviter l'autre parent » — the link that makes a second person a full operator
// of THIS household (migration 0128 for why the household had only ever had one).
//
// Same stateless-capability shape as shared-trip-invite.ts, deliberately: the token
// carries the household id + the household's `invite_nonce`, there is no invite row,
// and rotating the nonce kills every outstanding link at once with nothing to sweep.
//
//   POST   /api/operator-invite  -> { url, expiresAt }   (mints the nonce if absent)
//   DELETE /api/operator-invite  -> rotate the nonce      (« Réinitialiser le lien »)
//   GET    /api/operator-invite  -> { operators: [...] }  (who can act as this household)
//
// Operator-only on all three. A kiosk device must not be able to mint a credential
// that outranks it, and the whole point of the invite is that an operator vouches for
// the person receiving it.
//
// SILENT in realtime: the link is returned inline and no polled cache changes.

// One shared read: the nonce, minted on first use. NULL until someone actually
// invites (see 0128) — a secret written for a household that never invites anyone is
// a secret with no purpose, and rotating one that was never used would read as a
// revocation that never happened.
async function currentNonce(env: Parameters<typeof issueOperatorInvite>[0], householdId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT invite_nonce FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ invite_nonce: string | null }>()
  if (row?.invite_nonce) return row.invite_nonce
  const nonce = newId()
  await env.DB.prepare('UPDATE households SET invite_nonce = ?, updated_at = ? WHERE id = ?')
    .bind(nonce, nowSec(), householdId)
    .run()
  return nonce
}

export const onRequestGet = authed(async (ctx, actor) => {
  // Who can currently act as this household. `created_at` orders them, so the founder
  // reads first — there is no "owner" flag and deliberately so: co-operators are
  // equals, and inventing a hierarchy here would be a permission model nothing else
  // in this app has (resolveActor resolves scope from the ROW, not from a rank).
  // LIMIT 50 on a list whose real-world size is two. Not a paging cap — a household
  // is bounded by the number of adults in it, which is the case listCap.test.ts says
  // to leave alone. It is here because that guard is a whole-repo RATCHET: an
  // uncapped read raises the count whether or not this particular table grows, and
  // "mine is fine" from every author is how the ceiling stops meaning anything. A
  // bound nobody will ever reach costs one clause and keeps the number honest.
  const rows = await ctx.env.DB.prepare(
    'SELECT email, created_at FROM operators WHERE household_id = ? ORDER BY created_at LIMIT 50',
  )
    .bind(actor.householdId)
    .all<{ email: string; created_at: number }>()
  return ok({
    operators: rows.results.map((r) => ({ email: r.email, createdAt: r.created_at, isSelf: r.email === actor.email })),
  })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const nonce = await currentNonce(ctx.env, actor.householdId)
  const token = await issueOperatorInvite(ctx.env, actor.householdId, nonce)
  const origin = new URL(ctx.request.url).origin
  return ok({ url: `${origin}/rejoindre?j=${token}`, expiresAt: nowSec() + OPERATOR_INVITE_TTL })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  // Rotate. Unconditional — no "was there one" check, because the honest meaning of
  // « Réinitialiser » is "whatever is out there stops working", and that is true
  // whether or not a link was ever minted.
  await ctx.env.DB.prepare('UPDATE households SET invite_nonce = ?, updated_at = ? WHERE id = ?')
    .bind(newId(), nowSec(), actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
