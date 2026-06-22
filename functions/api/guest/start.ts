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
// LIMITATION: revocation-before-TTL is out of scope. To kill all outstanding
// tokens early you'd rotate SESSION_SECRET (which also logs everyone out). Keep
// TTLs short for that reason. (See functions/_lib/auth.ts issueGuestToken.)

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ ttlSeconds?: number; kind?: string }>(ctx.request)

  // Validate the kind explicitly: an unknown string is a client bug, not a silent
  // downgrade to showcase (which would over-share). Absent kind defaults to showcase.
  if (body?.kind != null && normalizeGuestKind(body.kind) !== body.kind) {
    return badRequest('Unknown share-mode kind.')
  }
  const kind: GuestKind = normalizeGuestKind(body?.kind)
  const ttlSeconds = clampShareTtl(kind, body?.ttlSeconds)

  const guestId = newId()
  const guestToken = await issueGuestToken(ctx.env, guestId, actor.householdId, ttlSeconds, kind)
  const expiresAt = nowSec() + ttlSeconds

  return ok({ guestToken, guestId, kind, ttlSeconds, expiresAt })
}, 'operator')
