// Runs on every Functions invocation. Two jobs:
//
//   1. Central CSRF gate. State-changing /api/* requests must carry a matching
//      X-CSRF-Token (double-submit) UNLESS they're in the exempt set. Handlers
//      don't each remember to check — the gate is here, like the portal.
//      Exempt: device pairing start/poll (the tablet has no cookie yet) and
//      the operator login (issues the cookie). Device-token writes are exempt
//      from the cookie-CSRF check because they authenticate by header, not
//      cookie, so they aren't subject to cookie-riding CSRF.
//
//   2. Global error boundary for /api/*. Any handler that throws — or any route
//      that lacks its own try/catch — becomes a clean JSON 500 with a server-
//      side log, never a leaked stack. New endpoints get this for free; they
//      don't have to remember to wrap themselves. (Authed handlers also catch
//      internally so they stay self-contained and unit-testable; this is the
//      backstop for everything else.)
//
//   3. Nothing else for the prototype — single host, so host->tenant routing
//      is deferred (household is resolved per-request from the credential in
//      _lib/household.ts). The table exists for when custom domains land.

import type { Env } from './_lib/env'
import { verifyCsrf } from './_lib/auth'
import { forbidden, serverError } from './_lib/json'

const CSRF_EXEMPT = new Set<string>([
  'api/auth/login',
  'api/auth/signup',
  'api/pair/start',
  'api/pair/poll',
  // The public demo mint (« Essaie sans peur », bmad/08 A-8) — no cookie yet.
  'api/demo',
])

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const path = url.pathname.replace(/^\/+/, '')
  const isApi = path.startsWith('api/')

  if (isApi && !SAFE_METHODS.has(ctx.request.method)) {
    const isExempt = CSRF_EXEMPT.has(path)
    // A device-token request carries no auth cookie, so the cookie-riding CSRF
    // threat doesn't apply — its header IS the credential. Let it pass the
    // cookie-CSRF gate; resolveActor still verifies the token + revocation.
    const hasDeviceToken = !!ctx.request.headers.get('X-Device-Token')
    if (!isExempt && !hasDeviceToken && !verifyCsrf(ctx.request)) {
      return forbidden('Bad or missing CSRF token.')
    }
  }

  // Static assets pass straight through; only /api/* gets the JSON error shape.
  if (!isApi) return ctx.next()

  try {
    return await ctx.next()
  } catch (err) {
    console.error(`[${ctx.request.method} /${path}]`, err)
    return serverError()
  }
}
