// Cloudflare Worker entry — the deploy target (wrangler deploy → workers.dev).
//
// Babillard began as a Cloudflare Pages app: static SPA in dist/ + a tree of
// Pages Functions under functions/api/, with a _middleware.ts. This Worker is
// the same app on the Workers platform:
//   • non-/api/* requests → env.ASSETS (the built SPA; unknown paths fall back
//     to index.html via not_found_handling = "single-page-application").
//   • /api/* requests → routed to the EXISTING Pages-Functions handlers through
//     a tiny EventContext adapter, with the _middleware logic (CSRF gate +
//     error boundary) reproduced inline here.
//
// The handlers and _lib are unchanged — they only ever read ctx.env / ctx.request
// / ctx.params, all of which the adapter provides.

import type { Env } from '../functions/_lib/env'
import { verifyCsrf } from '../functions/_lib/auth'
import { forbidden, serverError, notFound } from '../functions/_lib/json'
import { resolveActor } from '../functions/_lib/household'
import { matchRoute, type RouteMod } from './routes'

// Re-export the Durable Object class so the Workers runtime can find it (a DO
// must be exported from the entry module named in wrangler.toml). SCAFFOLD (#20).
export { RealtimeHub } from './RealtimeHub'

// The Worker env is the Functions Env plus the static-assets binding (declared
// in wrangler.toml) and the OPTIONAL realtime DO namespace. REALTIME_HUB is
// optional so the app still builds/runs when the DO binding isn't provisioned —
// /api/live then 503s and polling carries on (it's an optimization, not a dep).
type WorkerEnv = Env & { ASSETS: Fetcher; REALTIME_HUB?: DurableObjectNamespace }

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// Mirror functions/_middleware.ts: these state-changing endpoints have no cookie
// yet (pairing) or issue it (login), so they're exempt from the CSRF gate.
const CSRF_EXEMPT = new Set(['auth/login', 'auth/signup', 'pair/start', 'pair/poll'])

const METHOD_EXPORT: Record<string, string> = {
  GET: 'onRequestGet',
  HEAD: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  PATCH: 'onRequestPatch',
  DELETE: 'onRequestDelete',
  OPTIONS: 'onRequestOptions',
}

function pickHandler(mod: RouteMod, method: string) {
  return mod[METHOD_EXPORT[method] ?? ''] ?? mod.onRequest
}

const methodNotAllowed = () =>
  new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export default {
  // Param types come from `satisfies ExportedHandler<WorkerEnv>` below — the
  // incoming request carries Cf properties, so we don't annotate it as a plain
  // Request (which would mismatch EventContext's request type).
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)

    // Force HTTPS. The custom domain answers plain http://, and Safari defaults a
    // bare-typed domain to http — so an iPad home-screen PWA added that way loads
    // in a NON-secure context, where `navigator.mediaDevices` is undefined and Web
    // Speech recognition is refused (mic instant-aborts). A non-secure origin also
    // breaks service workers / PWA install. Bounce any http load to https before
    // anything else; localhost (wrangler/vite dev) stays untouched. Cloudflare's
    // "Always Use HTTPS" does this at the edge too — this is in-code defence so the
    // guarantee ships with the Worker regardless of dashboard state.
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'http:' && !isLocal) {
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 301)
    }

    const path = url.pathname.replace(/^\/+/, '')

    // Everything that isn't an API call is the SPA. The assets binding serves a
    // real file when one matches, else index.html (SPA fallback) for client routes.
    if (!path.startsWith('api/')) return env.ASSETS.fetch(request)

    const apiPath = path.slice('api/'.length)

    // 0. Realtime WebSocket upgrade (SCAFFOLD, #20). /api/live is the ONE route
    //    that hijacks the request into a Durable Object instead of a handler. We
    //    authenticate the upgrade FIRST (401 if no actor) so a socket is only ever
    //    opened for a real household — then route it to THAT household's DO stub,
    //    so connections can't cross households. Purely additive + fail-safe: if
    //    the DO binding isn't provisioned we 503 and the client falls back to
    //    polling (src/lib/query.ts owns freshness regardless).
    if (apiPath === 'live') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade.', { status: 426 })
      }
      const actor = await resolveActor(env, request)
      if (!actor) return new Response('Not signed in.', { status: 401 })
      if (!env.REALTIME_HUB) {
        // DO not deployed/eligible — tell the client to stick with polling.
        return new Response('Realtime unavailable.', { status: 503 })
      }
      // One DO per household: derive the instance id from the household id so all
      // of a household's devices land on the same hub. Forward the upgrade request
      // unchanged; the DO returns the 101 with the server-side socket.
      const id = env.REALTIME_HUB.idFromName(actor.householdId)
      const stub = env.REALTIME_HUB.get(id)
      return stub.fetch(request)
    }

    // 1. CSRF gate (double-submit), skipped for safe methods, the exempt set,
    //    and header-authenticated device requests (no cookie to ride).
    if (!SAFE_METHODS.has(request.method)) {
      const exempt = CSRF_EXEMPT.has(apiPath)
      const hasDeviceToken = !!request.headers.get('X-Device-Token')
      if (!exempt && !hasDeviceToken && !verifyCsrf(request)) {
        return forbidden('Bad or missing CSRF token.')
      }
    }

    const matched = matchRoute(apiPath)
    if (!matched) return notFound()
    const handler = pickHandler(matched.mod, request.method)
    if (!handler) return methodNotAllowed()

    // Adapt the Worker request into the EventContext the Pages handler expects.
    // Handlers use only request / env / params; the rest is provided for shape.
    const context: EventContext<Env, string, { householdId?: string }> = {
      request,
      env,
      params: matched.params,
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: ctx.passThroughOnException.bind(ctx),
      next: async () => notFound(),
      data: {},
      functionPath: '/' + path,
    }

    // 2. Error boundary (mirrors _middleware): a thrown handler becomes a clean
    //    JSON 500 with a server-side log, never a leaked stack. (authed()
    //    handlers also catch internally; this backstops the unauthed ones.)
    try {
      return await handler(context)
    } catch (err) {
      console.error(`[${request.method} /${path}]`, err)
      return serverError()
    }
  },
} satisfies ExportedHandler<WorkerEnv>
