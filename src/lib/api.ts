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

// `idempotencyKey` (B-9, bmad/10): every mutating `writeWith` call carries one now
// — the online attempt AND a queued/replayed write reuse the SAME key (hoisted in
// write.ts), so the server (authed → withIdempotency) dedups a double-tap/replay
// regardless of which leg it lands on. `replay` marks specifically an
// offline-outbox REPLAY (see the guest backstop below) — a direct `api()` caller
// may now set `idempotencyKey` too (a one-liner, per the item's scope note) without
// that alone granting the guest bypass.
type Options = { method?: string; body?: unknown; idempotencyKey?: string; replay?: boolean; timeoutMs?: number }

// `fetch` never times out on its own — a stalled connection (a store's captive
// portal, a wifi AP going out of range mid-handshake, any "packets silently
// dropped, no TCP RST" black hole) leaves this promise unresolved forever. That
// hung `auth/me` call left a FREQUENT user, offline in a store, staring at only a
// loading spinner: `AuthProvider.refresh()` awaits `api()` inside try/finally, so
// `loading` never flips false, and the router's `/` entry has nothing else to fall
// back on. Every caller gets a bound now: a plain JSON call gives up after
// `DEFAULT_TIMEOUT_MS` (matches `lib/online.ts`'s own `SUPPRESS_WINDOW_MS`, so a
// timed-out call and "this looks offline" agree); a Blob body (photo/audio/drawing
// upload) gets more room — those are legitimately slower and more likely to be
// attempted on a weak signal in the first place. A timeout throws a plain
// `DOMException` (NOT an `ApiError`), so `writeWith` still classifies it as a
// transport failure and queues it to the offline outbox exactly like any other
// network error — nothing about that contract changes.
const DEFAULT_TIMEOUT_MS = 20_000
const UPLOAD_TIMEOUT_MS = 60_000

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'

  // Read-only backstop. A guest session is read-only two ways: a LINK guest
  // (babysitter token) — the server independently 403s those — and the operator's
  // SETTINGS PREVIEW, where the server CAN'T help because it sees the operator's
  // real session, not a guest token. `writeWith()` already refuses guest writes,
  // but direct api() callers (media upload, ghost toggle, contact-photo edits)
  // skip that path. So refuse every mutating method here — the single network
  // chokepoint — mirroring the server's own 403 so callers handle it identically.
  // Exception: an offline-outbox REPLAY (`replay: true`) is an operator write
  // authored before preview; it was never guest-authored (writeWith blocks that at
  // enqueue), so replaying it is correct, not a guest mutation. This tests the
  // explicit `replay` flag, NOT idempotencyKey presence — since B-9 (bmad/10) a
  // normal online write from `writeWith` carries a key too, so key-presence alone
  // no longer means "this is a replay" and can't be trusted as the bypass signal.
  // Exception: the family-info intake submit — the ONE write an 'intake' link is
  // meant to make. The server still verifies the token IS an intake guest before
  // it writes (functions/api/guest/intake-submit.ts), so this only lets the call
  // reach the server; it doesn't grant anyone write access they wouldn't have.
  const cleanPath = path.replace(/^\/+/, '')
  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    !opts.replay &&
    cleanPath !== 'guest/intake-submit' &&
    cleanPath !== 'guest/intake-media' &&
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

  // Dedup key — see Options.idempotencyKey (B-9: sent on the online attempt too now).
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  const payload = opts.body === undefined ? undefined : isBlob ? (opts.body as Blob) : JSON.stringify(opts.body)

  // A write fired while the page is going away or hidden (the undo toast flushes
  // its held deletes on pagehide/lock — lib/toast) is aborted with the document
  // unless it asks to outlive it. keepalive carries a small body past teardown;
  // blobs and big payloads keep the normal path (keepalive's quota is 64 KB).
  const keepalive =
    method !== 'GET' &&
    method !== 'HEAD' &&
    !isBlob &&
    (typeof payload !== 'string' || payload.length < 30_000) &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'

  // A keepalive request is deliberately UNBOUNDED — it exists specifically to
  // outlive teardown (pagehide/lock) after the JS context that started it may
  // already be gone, so there's nothing here to abort it FOR: cutting it off at
  // our own timeout would just turn "let the browser finish this in the
  // background" back into "lose the write," the exact loss keepalive was added to
  // prevent. Every other call gets bounded — no timer/signal is wired up at all
  // for a keepalive request, rather than a timer that also aborts it.
  const timeoutMs = opts.timeoutMs ?? (isBlob ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)
  const controller = keepalive ? null : new AbortController()
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  let res: Response
  let text: string
  try {
    res = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: payload,
      keepalive: keepalive || undefined,
      signal: controller?.signal,
    })
    // `fetch` resolves as soon as HEADERS arrive — a connection that answers the
    // handshake and then stalls mid-body (a proxy/captive-portal drop, a signal
    // that cuts out right after) would hang HERE, one phase later, if the timer
    // stopped covering it. Reading the body under the SAME timer/signal is what
    // keeps that stall bounded too.
    text = await res.text()
  } finally {
    if (timer) clearTimeout(timer)
  }

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
