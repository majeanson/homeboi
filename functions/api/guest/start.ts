import { ok, badRequest, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { issueGuestToken, normalizeGuestKind, type GuestKind } from '../../_lib/auth'
import { clampShareTtl } from '../../_lib/shareModes'
import { newId, nowSec } from '../../_lib/ids'

// Mint a typed share-link token. Operator-only (a kiosk or guest can't hand out
// access). The token is a stateless HMAC capability bound to this household,
// READ-ONLY, time-boxed, and carries its share-mode `kind` (see auth.ts GuestKind)
// which scopes what it can read (enforced by the allowlist in worker/index.ts).
// The per-kind TTL window lives in _lib/shareModes (clampShareTtl).
//
// Each minted link is recorded in `guests` (keyed by its token id) so the operator
// can REVOKE it before its TTL — resolveActor rejects a token whose row is revoked
// (REVIEW-PASS §509). A token with no row (legacy, pre-0098) still works until it
// expires. The insert is best-effort: a token stays valid even if the row write
// fails (it just can't be revoked early) — never fail the mint over bookkeeping.

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ ttlSeconds?: number; kind?: string; targetKey?: string; fields?: number }>(ctx.request)

  // Validate the kind explicitly: an unknown string is a client bug, not a silent
  // downgrade to showcase (which would over-share). Absent kind defaults to showcase.
  if (body?.kind != null && normalizeGuestKind(body.kind) !== body.kind) {
    return badRequest('Unknown share-mode kind.')
  }
  const kind: GuestKind = normalizeGuestKind(body?.kind)
  const ttlSeconds = clampShareTtl(kind, body?.ttlSeconds)

  // A per-person intake link binds the addressed person into the SIGNED token so it
  // can't be retargeted by editing the URL. Only meaningful for 'intake'; ignored
  // for every other kind (a curated/showcase link has no target).
  const targetKey =
    kind === 'intake' && typeof body?.targetKey === 'string' && body.targetKey ? body.targetKey : null

  // Field scope: which optional sections the intake form asks for. Clamp to the
  // valid 4-bit range; anything out of range (or non-intake) → null = ask everything.
  const fields =
    kind === 'intake' && typeof body?.fields === 'number' && body.fields >= 0 && body.fields <= 15
      ? Math.floor(body.fields)
      : null

  const guestId = newId()
  const guestToken = await issueGuestToken(ctx.env, guestId, actor.householdId, ttlSeconds, kind, targetKey, fields)
  const now = nowSec()
  const expiresAt = now + ttlSeconds

  // Record the link so it can be listed + revoked (§509). Best-effort: the token is
  // already valid regardless — a failed row write just means it can't be killed early.
  try {
    await ctx.env.DB.prepare(
      'INSERT INTO guests (id, household_id, kind, target_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(guestId, actor.householdId, kind, targetKey, now, expiresAt)
      .run()
  } catch {
    /* bookkeeping only — never fail the mint over it */
  }

  return ok({ guestToken, guestId, kind, ttlSeconds, expiresAt, targetKey })
}, 'operator')
