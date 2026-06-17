import { ok, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { issueGuestToken } from '../../_lib/auth'
import { newId, nowSec } from '../../_lib/ids'

// Mint a babysitter / guest access token. Operator-only (a kiosk or guest can't
// hand out access). The token is a stateless HMAC capability bound to this
// household, READ-ONLY, and time-boxed: it carries its own expiry and there is no
// DB row, so it simply stops working when the TTL passes.
//
// LIMITATION: revocation-before-TTL is out of scope. To kill all outstanding
// guest tokens early you'd rotate SESSION_SECRET (which also logs everyone out).
// Keep TTLs short for that reason. (See functions/_lib/auth.ts issueGuestToken.)
const MIN_TTL = 30 * 60 // 30 min
const MAX_TTL = 24 * 60 * 60 // 24 h
const DEFAULT_TTL = 60 * 60 // 1 h

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ ttlSeconds?: number }>(ctx.request)
  const raw = Number(body?.ttlSeconds)
  const ttlSeconds = Number.isFinite(raw) ? Math.min(MAX_TTL, Math.max(MIN_TTL, Math.floor(raw))) : DEFAULT_TTL

  const guestId = newId()
  const guestToken = await issueGuestToken(ctx.env, guestId, actor.householdId, ttlSeconds)
  const expiresAt = nowSec() + ttlSeconds

  return ok({ guestToken, guestId, ttlSeconds, expiresAt })
}, 'operator')
