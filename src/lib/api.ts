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

type Options = { method?: string; body?: unknown }

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = {}

  if (opts.body !== undefined) headers['content-type'] = 'application/json'

  // Kiosk identity. Sent on every call; harmless on operator-only routes
  // (the server prefers the cookie when both are present).
  const deviceToken = getDeviceToken()
  if (deviceToken) headers['X-Device-Token'] = deviceToken

  // Tell the server which language to answer AI calls in.
  const lang = readLang()
  if (lang) headers['X-Lang'] = lang

  // CSRF double-submit for state-changing operator requests.
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCsrfCookie()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  const res = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
