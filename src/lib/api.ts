// The ONLY path to /api/*. Handles CSRF echo (operator), device-token header
// (kiosk), credentials, and JSON error parsing. Don't call fetch directly for
// the API — you'll lose one of these and get a silent 403.
import { getDeviceToken } from './device'

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

type Options = { method?: string; body?: unknown }

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = {}

  // A Blob body (image upload) is sent raw with its own type; everything else is
  // JSON. Same CSRF/credentials/device-token plumbing applies either way.
  const isBlob = opts.body instanceof Blob
  if (opts.body !== undefined) {
    headers['content-type'] = isBlob ? (opts.body as Blob).type || 'application/octet-stream' : 'application/json'
  }

  // Kiosk identity. Sent on every call; harmless on operator-only routes
  // (the server prefers the cookie when both are present).
  const deviceToken = getDeviceToken()
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

  const res = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body === undefined ? undefined : isBlob ? (opts.body as Blob) : JSON.stringify(opts.body),
  })

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
