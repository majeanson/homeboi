// Auth: two credential kinds, one HMAC key.
//
//   1. Operator session cookie (`bb_session`) — the logged-in human who owns
//      the household. Format base64url(payload).base64url(sig), HMAC-SHA-256,
//      payload { e: email, x: expSeconds }. Same shape as the portal.
//   2. Device token — a paired wall tablet. Format identical, payload
//      { d: deviceId, h: householdId, x: expSeconds }. The tablet stores it in
//      localStorage and sends it as `X-Device-Token` (kiosk, no cookie login).
//
// Plus a double-submit CSRF cookie (`bb_csrf`, NOT HttpOnly) the SPA echoes as
// `X-CSRF-Token` for state-changing operator requests.

import type { Env } from './env'
import { nowSec } from './ids'

const SESSION_COOKIE = 'bb_session'
const CSRF_COOKIE = 'bb_csrf'
const DEVICE_HEADER = 'X-Device-Token'
const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days

class SessionSecretMisconfiguredError extends Error {}

// Without this guard, TextEncoder().encode(undefined) yields the bytes for the
// literal string "undefined" — a publicly-known HMAC key that silently
// downgrades every token to forgeable. The type says string; only runtime
// catches the missing/short secret. Do not weaken.
function requireSessionSecret(env: Env): string {
  const s = env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new SessionSecretMisconfiguredError('SESSION_SECRET missing or < 32 chars')
  }
  return s
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

// Constant-time compare so a forged signature can't be guessed byte-by-byte
// via timing.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function signToken(env: Env, payload: object): Promise<string> {
  const secret = requireSessionSecret(env)
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = b64urlEncode(await hmac(secret, body))
  return `${body}.${sig}`
}

async function verifyToken<T>(env: Env, token: string | null): Promise<T | null> {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let secret: string
  try {
    secret = requireSessionSecret(env)
  } catch {
    return null
  }
  // A malformed token (bad base64, non-JSON payload) must resolve to null, never
  // throw — verifyGuestToken now runs on the Worker dispatch path for EVERY
  // header-token request (worker/index.ts guest-scope guard), outside the handler
  // error boundary, so a thrown decode here would surface as a 500 instead of a
  // clean 401. Wrap the whole verify in one catch.
  try {
    const expected = await hmac(secret, body)
    if (!timingSafeEqual(b64urlDecode(sig), expected)) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as { x?: number }
    if (typeof payload.x === 'number' && payload.x < nowSec()) return null
    return payload as T
  } catch {
    return null
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

// ---- Operator session ------------------------------------------------------

export async function issueSession(env: Env, email: string): Promise<{ session: string; csrf: string }> {
  const session = await signToken(env, { e: email, x: nowSec() + SESSION_TTL })
  // CSRF token is just a random value; security comes from "header must equal
  // cookie", which a cross-site attacker can't read.
  const csrf = b64urlEncode(crypto.getRandomValues(new Uint8Array(18)))
  return { session, csrf }
}

export function sessionCookies(session: string, csrf: string): string[] {
  const base = `Path=/; Max-Age=${SESSION_TTL}; SameSite=Lax`
  return [
    `${SESSION_COOKIE}=${session}; HttpOnly; Secure; ${base}`,
    // NOT HttpOnly — the SPA reads it to echo as X-CSRF-Token (double-submit).
    `${CSRF_COOKIE}=${csrf}; Secure; ${base}`,
  ]
}

export function clearSessionCookies(): string[] {
  const base = 'Path=/; Max-Age=0; SameSite=Lax'
  return [
    `${SESSION_COOKIE}=; HttpOnly; Secure; ${base}`,
    `${CSRF_COOKIE}=; Secure; ${base}`,
  ]
}

export async function currentEmail(env: Env, request: Request): Promise<string | null> {
  const payload = await verifyToken<{ e: string }>(env, readCookie(request, SESSION_COOKIE))
  return payload?.e ?? null
}

export function verifyCsrf(request: Request): boolean {
  const cookie = readCookie(request, CSRF_COOKIE)
  const header = request.headers.get('X-CSRF-Token')
  return !!cookie && !!header && cookie === header
}

// ---- Device token ----------------------------------------------------------

export async function issueDeviceToken(env: Env, deviceId: string, householdId: string): Promise<string> {
  return signToken(env, { d: deviceId, h: householdId, x: nowSec() + SESSION_TTL * 12 })
}

// Verify a RAW device-token string (HMAC + expiry), independent of transport.
// The header path (currentDevice) and the realtime WS query-param path
// (worker/index.ts /api/live, where the browser WebSocket API can't set the
// X-Device-Token header) both call this, so a token is verified IDENTICALLY no
// matter how it arrives — no weakened second code path. Returns null for a
// missing/invalid/expired/wrong-typed token.
export async function verifyDeviceToken(
  env: Env,
  token: string | null,
): Promise<{ deviceId: string; householdId: string } | null> {
  const payload = await verifyToken<{ d?: string; h: string }>(env, token)
  return payload && typeof payload.d === 'string' ? { deviceId: payload.d, householdId: payload.h } : null
}

export async function currentDevice(
  env: Env,
  request: Request,
): Promise<{ deviceId: string; householdId: string } | null> {
  return verifyDeviceToken(env, request.headers.get(DEVICE_HEADER))
}

// ---- Guest token (typed, time-boxed read-only share links) -----------------
//
// A stateless HMAC capability that mirrors the device token: same key, same
// format, sent in the SAME `X-Device-Token` header. The payload tag distinguishes
// it — { g: guestId, h: householdId, k: kind, x: expSeconds }. There is NO DB row
// (so no revoke-before-expiry; the short TTL is the bound). resolveActor() treats
// a guest as strictly narrower than a kiosk: read-only (enforced in route.ts).
//
// `kind` (the share-mode axis) selects WHAT the link can read — enforced server-
// side by a per-kind path allowlist in worker/index.ts:
//   - 'showcase'  full hub, read-only (the legacy behaviour; a "Démo" link).
//   - 'sitter'    a curated babysitter-handoff endpoint only.
//   - 'welcome'   a near-public visitor card endpoint only.
//   - 'family'    the "grandparents' window" — grandkids' upcoming dates, birthdays
//                 and latest photos; cross-household warmth without the keys (#36).
// The curated kinds (sitter / welcome / family) share the ONE guest/window endpoint
// (it branches on kind), so the allowlist is identical for them. The kind is bound
// into the SIGNED token, so a curated guest can't widen its scope by editing the
// URL. A legacy token (no `k`) normalizes to 'showcase'.
//   - 'intake'    a relative-facing FORM link: a guest kind that may WRITE, and only
//                 to its single submit endpoint (functions/api/guest/intake-submit.ts).
//                 It fills a quarantine row the operator later reviews — it never
//                 touches the live cercle. Its scope (whoami / window greeting /
//                 intake-submit) lives in guestScope.ts and the narrow write carve-out
//                 in route.ts. An optional target person is bound into the token (`p`)
//                 for a per-person link; absent ⇒ an open family link.
//   - 'postbox'   « La boîte aux lettres » — the SECOND writable kind: a relative
//                 names themselves and drops a message (word / voice / drawing / photo)
//                 that lands quarantined and, on accept, becomes a board fridge note
//                 (functions/api/postbox.ts). Same shape as intake: scoped reads +
//                 two write endpoints (postbox-submit / postbox-media) in guestScope.ts.
export type GuestKind = 'showcase' | 'sitter' | 'welcome' | 'family' | 'intake' | 'postbox'
// Kinds that share the curated read-only guest/window endpoint. The writable kinds
// ('intake', 'postbox') are NOT among them — each has its own scope + write endpoints —
// but they ARE valid requestable kinds, so normalization recognises them without
// granting the window scope.
const CURATED_KINDS: GuestKind[] = ['sitter', 'welcome', 'family']
const KNOWN_KINDS: GuestKind[] = [...CURATED_KINDS, 'intake', 'postbox']

// One place decides the legacy/unknown → 'showcase' fallback, so every reader
// (verify, the allowlist, the SPA) agrees. Today's guests are read-only-
// everything, which IS showcase — so old links keep working unchanged.
export function normalizeGuestKind(k: unknown): GuestKind {
  return KNOWN_KINDS.includes(k as GuestKind) ? (k as GuestKind) : 'showcase'
}

// D-18 (bmad/10) — a STANDING guest (« Mamie », a weekly gardienne) keeps a stateless
// HMAC token but doesn't want a short TTL to force a fresh link every visit. Rather
// than make the token itself unexpiring (a forgotten one would then live forever
// even server-unaware of it), it carries a generous BACKSTOP expiry — 10 years — and
// the REAL kill switch moves to the DB: household.ts's guestRowAcceptable requires
// the `guests` row to exist and be unrevoked for a standing (`s:1`) token, where a
// legacy/short-TTL token stays row-optional (unchanged). See migration 0107.
export const STANDING_TTL = 60 * 60 * 24 * 365 * 10 // 10 years — a backstop, not the real bound

export async function issueGuestToken(
  env: Env,
  guestId: string,
  householdId: string,
  ttlSeconds: number,
  kind: GuestKind = 'showcase',
  // Only meaningful for 'intake': the person key (`member:<id>` / `contact:<id>`)
  // this form link is pre-addressed to, signed in so it can't be tampered. Absent
  // ⇒ an open "add yourself" link.
  targetKey?: string | null,
  // Only meaningful for 'intake': a bitmask of which optional sections the form asks
  // for (see _lib/intake.ts decodeIntakeScope). Absent ⇒ ask everything.
  fields?: number | null,
  // D-18 — mint a STANDING link (any kind may be standing). The caller still passes
  // `ttlSeconds`, but a standing mint should pass STANDING_TTL so the signed expiry
  // matches the DB row's `expires_at` — kept as a parameter (not computed here) so a
  // guest/start.ts test can assert both stay in lockstep.
  standing?: boolean,
): Promise<string> {
  const payload: { g: string; h: string; k: GuestKind; x: number; p?: string; f?: number; s?: number } = {
    g: guestId,
    h: householdId,
    k: kind,
    x: nowSec() + ttlSeconds,
  }
  if (targetKey) payload.p = targetKey
  if (typeof fields === 'number') payload.f = fields
  if (standing) payload.s = 1
  return signToken(env, payload)
}

// Verify a RAW guest-token string (HMAC + expiry), independent of transport —
// the guest counterpart of verifyDeviceToken, shared by the header path and the
// realtime WS query-param path so verification is identical either way. A device
// payload has `d` and no `g`, so the `g`-typed check yields null for a real
// device token (and vice-versa); expiry (`x`) is checked inside verifyToken.
export async function verifyGuestToken(
  env: Env,
  token: string | null,
): Promise<{
  guestId: string
  householdId: string
  kind: GuestKind
  targetKey: string | null
  fields: number | null
  standing: boolean
} | null> {
  const payload = await verifyToken<{ g?: string; h: string; k?: string; p?: string; f?: number; s?: number }>(env, token)
  return payload && typeof payload.g === 'string'
    ? {
        guestId: payload.g,
        householdId: payload.h,
        kind: normalizeGuestKind(payload.k),
        targetKey: typeof payload.p === 'string' ? payload.p : null,
        fields: typeof payload.f === 'number' ? payload.f : null,
        standing: payload.s === 1,
      }
    : null
}

export async function currentGuest(
  env: Env,
  request: Request,
): Promise<{
  guestId: string
  householdId: string
  kind: GuestKind
  targetKey: string | null
  fields: number | null
  standing: boolean
} | null> {
  // Same header as the device token (see verifyGuestToken for how the two are
  // told apart). HMAC-only, no DB read — cheap enough to run on the dispatch path.
  return verifyGuestToken(env, request.headers.get(DEVICE_HEADER))
}

// ---- Shared-trip invite token (« Voyage partagé » join link) ---------------
//
// A stateless HMAC CAPABILITY that lets another operator JOIN a shared trip. Same
// key + format as the device/guest tokens, but a distinct payload tag so the three
// never cross-verify — { st: sharedTripId, n: inviteNonce, x: expSeconds }. Unlike a
// guest token this is NOT a transport credential (it never rides X-Device-Token /
// resolveActor); it's handed to shared-trip-join's GET/POST as `?j=` / `{ token }` and
// verified there. There is NO invite DB row: the trip's `invite_nonce` column is the
// revocation handle — « Réinitialiser le lien » rotates the nonce and every
// outstanding link dies at once (nothing to sweep). TTL 14 days by default.
export const SHARED_TRIP_INVITE_TTL = 60 * 60 * 24 * 14 // 14 days

export async function issueSharedTripInvite(
  env: Env,
  sharedTripId: string,
  nonce: string,
  ttlSeconds: number = SHARED_TRIP_INVITE_TTL,
): Promise<string> {
  return signToken(env, { st: sharedTripId, n: nonce, x: nowSec() + ttlSeconds })
}

// Verify a RAW invite-token string (HMAC + expiry), returning its payload — NOT a
// membership check (the caller compares the returned `nonce` against the trip's live
// `invite_nonce` so a rotated link is rejected). The `st`-typed guard yields null for a
// device (`d`) / guest (`g`) / session (`e`) token, and rejecting a payload that ALSO
// carries any of those keys stops a crafted token from cross-verifying either way —
// mirroring how verifyGuestToken guards with `g`. Expiry (`x`) is checked in verifyToken.
export async function verifySharedTripInvite(
  env: Env,
  token: string | null,
): Promise<{ sharedTripId: string; nonce: string } | null> {
  const payload = await verifyToken<{ st?: string; n?: string; g?: string; d?: string; e?: string }>(env, token)
  if (!payload) return null
  // Must be an st-typed token AND carry none of the other credential tags.
  if (typeof payload.st !== 'string' || typeof payload.n !== 'string') return null
  if ('g' in payload || 'd' in payload || 'e' in payload) return null
  return { sharedTripId: payload.st, nonce: payload.n }
}
