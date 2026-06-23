// The ONLY path to /api/*. Handles CSRF echo (operator), device-token header
// (kiosk), credentials, and JSON error parsing. Don't call fetch directly for
// the API — you'll lose one of these and get a silent 403.
import { getDeviceToken, getGuestToken, isGuest } from './device'
import { emitAiError } from './aiErrorBus'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Status predicates so callers don't re-spell `e instanceof ApiError && ...`.
// `isUnauthorized` (401) means "no household yet" → send them to pair/login;
// `isStatus` covers the rest (503 = a degraded AI endpoint, etc.).
export const isStatus = (e: unknown, status: number): boolean => e instanceof ApiError && e.status === status
export const isUnauthorized = (e: unknown): boolean => isStatus(e, 401)

function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)bb_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// The UI's active locale, persisted by main.tsx. Sent so server-side AI
// (capture router, meal suggestion) answers in the language the user sees.
function readLang(): string | null {
  try {
    const l = localStorage.getItem('babillard-lang')
    return l === 'fr' || l === 'en' ? l : null
  } catch {
    return null
  }
}

// The picked member id for this device (lib/profile), read straight from storage
// so api() stays a plain function (no React context).
function readProfile(): string | null {
  try {
    return localStorage.getItem('babillard-profile')
  } catch {
    return null
  }
}

// `idempotencyKey` is set only by the offline outbox when REPLAYING a queued
// write — the server (authed → withIdempotency) dedups on it so a replay never
// double-applies. Online calls omit it and run straight through.
type Options = { method?: string; body?: unknown; idempotencyKey?: string }

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'

  // Read-only backstop. A guest session is read-only two ways: a LINK guest
  // (babysitter token) — the server independently 403s those — and the operator's
  // SETTINGS PREVIEW, where the server CAN'T help because it sees the operator's
  // real session, not a guest token. `writeWith()` already refuses guest writes,
  // but direct api() callers (media upload, ghost toggle, contact-photo edits)
  // skip that path. So refuse every mutating method here — the single network
  // chokepoint — mirroring the server's own 403 so callers handle it identically.
  // Exception: an offline-outbox REPLAY (idempotencyKey set) is an operator write
  // authored before preview; it was never guest-authored (writeWith blocks that at
  // enqueue), so replaying it is correct, not a guest mutation.
  // Exception: the family-info intake submit — the ONE write an 'intake' link is
  // meant to make. The server still verifies the token IS an intake guest before
  // it writes (functions/api/guest/intake-submit.ts), so this only lets the call
  // reach the server; it doesn't grant anyone write access they wouldn't have.
  const cleanPath = path.replace(/^\/+/, '')
  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    !opts.idempotencyKey &&
    cleanPath !== 'guest/intake-submit' &&
    isGuest()
  ) {
    throw new ApiError(403, 'Lecture seule (mode invité).')
  }

  const headers: Record<string, string> = {}

  // A Blob body (image upload) is sent raw with its own type; everything else is
  // JSON. Same CSRF/credentials/device-token plumbing applies either way.
  const isBlob = opts.body instanceof Blob
  if (opts.body !== undefined) {
    headers['content-type'] = isBlob ? (opts.body as Blob).type || 'application/octet-stream' : 'application/json'
  }

  // Kiosk identity. Sent on every call; harmless on operator-only routes
  // (the server prefers the cookie when both are present). A guest (babysitter)
  // token rides the SAME header — the server tells them apart by payload tag and
  // treats a guest as read-only. The device token wins if both are stored, so a
  // paired kiosk is never downgraded to guest.
  const deviceToken = getDeviceToken() ?? getGuestToken()
  if (deviceToken) headers['X-Device-Token'] = deviceToken

  // Tell the server which language to answer AI calls in.
  const lang = readLang()
  if (lang) headers['X-Lang'] = lang

  // Who's acting on this device (pick-your-face), so writes can be attributed.
  // Presentation/attribution only — never an access decision (see lib/profile).
  const profile = readProfile()
  if (profile) headers['X-Profile'] = profile

  // CSRF double-submit for state-changing operator requests.
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCsrfCookie()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  // Replay dedup key (offline outbox only) — see Options.idempotencyKey.
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  const res = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body === undefined ? undefined : isBlob ? (opts.body as Blob) : JSON.stringify(opts.body),
  })

  // A Workers AI call degraded server-side: the handler tagged the response so we
  // can surface a notice (on success OR a 503), regardless of this body's shape.
  const aiErr = res.headers.get('X-AI-Error')
  if (aiErr) {
    let message = aiErr
    try {
      message = decodeURIComponent(aiErr)
    } catch {
      /* keep the raw value if it isn't valid percent-encoding */
    }
    emitAiError({ feature: path.replace(/^\/+/, ''), message })
  }

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }

  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `Erreur ${res.status}`
    throw new ApiError(res.status, message)
  }
  return data as T
}
