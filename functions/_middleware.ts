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
//   2. Nothing else for the prototype — single host, so host->tenant routing
//      is deferred (household is resolved per-request from the credential in
//      _lib/household.ts). The table exists for when custom domains land.

import type { Env } from './_lib/env'
import { verifyCsrf } from './_lib/auth'
import { forbidden } from './_lib/json'

const CSRF_EXEMPT = new Set<string>([
  'api/auth/login',
  'api/auth/logout',
  'api/pair/start',
  'api/pair/poll',
])

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const path = url.pathname.replace(/^\/+/, '')

  if (path.startsWith('api/') && !SAFE_METHODS.has(ctx.request.method)) {
    const isExempt = CSRF_EXEMPT.has(path)
    // A device-token request carries no auth cookie, so the cookie-riding CSRF
    // threat doesn't apply — its header IS the credential. Let it pass the
    // cookie-CSRF gate; resolveActor still verifies the token + revocation.
    const hasDeviceToken = !!ctx.request.headers.get('X-Device-Token')
    if (!isExempt && !hasDeviceToken && !verifyCsrf(ctx.request)) {
      return forbidden('Bad or missing CSRF token.')
    }
  }

  return ctx.next()
}
