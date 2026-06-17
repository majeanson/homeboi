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
  const expected = await hmac(secret, body)
  if (!timingSafeEqual(b64urlDecode(sig), expected)) return null
  try {
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

export async function currentDevice(
  env: Env,
  request: Request,
): Promise<{ deviceId: string; householdId: string } | null> {
  const payload = await verifyToken<{ d: string; h: string }>(env, request.headers.get(DEVICE_HEADER))
  return payload ? { deviceId: payload.d, householdId: payload.h } : null
}
