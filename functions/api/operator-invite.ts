import { forbidden, notFound, ok, readJson } from '../_lib/json'
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

// Link an account to a household FACE (migration 0130), or clear the link.
//
// YOUR OWN row only. Deciding which face somebody else's phone attributes to is not
// a household setting — it is putting words in their mouth, and the device pick they
// already control is the honest place for it.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ memberId?: string | null }>(ctx.request)
  const memberId = typeof body?.memberId === 'string' && body.memberId.trim() ? body.memberId.trim() : null
  if (memberId) {
    // Must be a member of THIS household. A soft ref (DB-5) is not a foreign key, so
    // nothing else would catch an id from somewhere else — and an id that resolves to
    // no face is worse than none: it attributes writes to a ghost.
    const m = await ctx.env.DB.prepare('SELECT id FROM members WHERE id = ? AND household_id = ?')
      .bind(memberId, actor.householdId)
      .first<{ id: string }>()
    if (!m) return notFound('Cette personne n’est pas dans la maisonnée.')
  }
  await ctx.env.DB.prepare('UPDATE operators SET member_id = ? WHERE email = ? AND household_id = ?')
    .bind(memberId, actor.email ?? '', actor.householdId)
    .run()
  return ok({ ok: true, memberId })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ email?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()

  // — REMOVE A CO-OPERATOR (with `email`) —
  //
  // The gap the PARITY D1 scoring found: minting and rotating were there, and once
  // somebody had REDEEMED a link there was no way out. « Réinitialiser » kills the
  // outstanding links, not the access already granted — which is exactly the case
  // that matters after an invite goes to the wrong address, or a household changes.
  // A capability you can hand out and never take back is not a capability, it is a
  // one-way door.
  if (email) {
    // Never yourself. Removing your own row logs you out of a household you may be
    // the only operator of, from a button whose label says nothing about that.
    // « Se déconnecter » is the door for leaving; this one is for removing someone
    // else.
    if (email === actor.email) return forbidden('Tu ne peux pas retirer ton propre accès ici.')
    const row = await ctx.env.DB.prepare('SELECT email FROM operators WHERE email = ? AND household_id = ?')
      .bind(email, actor.householdId)
      .first<{ email: string }>()
    // Scoped to THIS household, so a stray email cannot be used to probe whether an
    // account exists elsewhere — it reads as "not here" either way.
    if (!row) return notFound('Cet accès n’existe pas dans cette maisonnée.')
    await ctx.env.DB.prepare('DELETE FROM operators WHERE email = ? AND household_id = ?')
      .bind(email, actor.householdId)
      .run()
    // NOTHING ELSE IS TOUCHED. Their sessions die with the row (resolveActor reads
    // `operators` on every request — there is no session table to sweep), and every
    // row they ever wrote stays: attribution here is a soft member ref, never an
    // operator FK, precisely so that removing an account never erases a household's
    // history (the DB-5 rule, and the reason it is written that way).
    return ok({ ok: true, removed: email })
  }

  // — ROTATE THE LINK (no `email`) —
  // Unconditional: the honest meaning of « Réinitialiser » is "whatever is out there
  // stops working", and that is true whether or not a link was ever minted.
  await ctx.env.DB.prepare('UPDATE households SET invite_nonce = ?, updated_at = ? WHERE id = ?')
    .bind(newId(), nowSec(), actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
