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
import { verifyCsrf, currentGuest, issueDeviceToken } from '../functions/_lib/auth'
import { forbidden, serverError, notFound } from '../functions/_lib/json'
import { resolveActor } from '../functions/_lib/household'
import { resolveTvCode } from '../functions/_lib/tvLink'
import { readLiveShare } from '../functions/_lib/shareStore'
import { shareOgMeta } from '../functions/_lib/shareOg'
import { matchRoute, guestKindAllows, type RouteMod } from './routes'
import { nightly } from '../functions/_lib/nightly'
import { withSecurityHeaders } from '../functions/_lib/securityHeaders'

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
// 'demo' mints the public read-only showcase token for « Essaie sans peur »
// (bmad/08 A-8) — a first-time visitor has no cookie yet, exactly like signup.
// 'operator-join' redeems an invite link (migration 0128): the person tapping it is
// signed into nothing yet, so there is no cookie to double-submit. The capability
// token in the body IS the credential, and it is checked against the household's live
// `invite_nonce` — a narrower gate than CSRF, not a missing one. (The MINT side,
// 'operator-invite', is NOT exempt: that one runs on a real operator session.)
// 'csp-report' is the browser's own POST (Content-Security-Policy-Report-Only,
// _lib/securityHeaders.ts): it carries no header of ours and answers 204 whatever it gets.
// 'mcp' is exempt because an MCP client is not a browser: it has no cookie, no CSRF
// pair to echo, and (per a known Claude Code bug, anthropics/claude-code#29562) may
// not even get its custom headers sent on the first call — so the token has to be
// allowed as `?t=`, the same concession /api/live already makes for a WebSocket
// handshake that cannot set headers. The exemption is only safe because mcp.ts
// REFUSES a session cookie outright (it demands scope 'kiosk' + kind 'agent', which
// only a token produces) and validates Origin. Relax either of those and this line
// becomes a cross-site hole.
//
// 'remarks/shipped' is the DEPLOY PIPELINE's callback (« Règle-remarque », 0136), not a
// browser's. GitHub Actions POSTs it after a SUCCESSFUL deploy of main to mark a remark
// « expédiée » with the commit that fixed it. There is no cookie to double-submit — no
// browser, no session, no same-site anything — so CSRF has nothing here to protect.
//
// THE NARROWER GATE is DEPLOY_NOTIFY_SECRET: a ≥32-char shared secret presented in
// X-Deploy-Secret and compared CONSTANT-TIME (_lib/deployHook.ts). Its polarity is the
// INVERSE of INVITE_CODE's — an unset, empty or short secret CLOSES this door (503)
// rather than opening it. Copying the signup-gate shape here deletes the lock.
//
// NOT X-Device-Token, deliberately: that header already skips CSRF for EVERY route
// (below) and resolves through resolveActor into an Actor with a household. A deploy is
// not an actor and must never become one — reusing it would mean minting a household
// credential for a pipeline.
//
// WHAT A LEAKED SECRET BUYS: flipping an EXISTING remark from 'open' to 'shipped' and
// appending one ≤2000-char journal entry, for an id the holder can already name. It
// cannot create a row, delete one, read one, list them, reach another table, obtain a
// session, or write 'confirmed' — a human's tap is the only thing that confirms, and
// « Pas réglé » undoes it. The id is ~70 bits behind the secret, so there is nothing to
// enumerate. And the framing that matters: anyone who can leak this secret can already
// push arbitrary code to main, which deploys unreviewed. The secret is strictly LESS
// powerful than the access needed to steal it. Rotation: `wrangler secret put` first,
// then the repo secret — deleting the Worker's copy first fails closed. /api/health
// reports `deployHook` so an unwired hook is visible instead of silent.
//
// 'pair/poll' USED TO BE HERE and was removed when csrfExempt.test.ts first ran: it
// answers GET only, and the gate below never looks at a safe method — so the entry had
// been doing nothing at all. Harmless, but dead weight in the one list that has to stay
// readable, and an entry that looks like a live hole is worse than no entry. If it ever
// grows a POST it starts out gated, which is the right default.
const CSRF_EXEMPT = new Set(['auth/login', 'auth/signup', 'auth/forgot', 'auth/reset', 'auth/verify', 'pair/start', 'demo', 'operator-join', 'csp-report', 'mcp', 'remarks/shipped'])

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

// Escape a string for an HTML attribute value (the appended og/twitter tags go in as raw
// HTML; setInnerContent/setAttribute below are escaped by HTMLRewriter itself).
const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Inject per-share Open Graph tags into the SPA shell for a /partage/<id> link, so it
// unfurls nicely in messaging apps. Returns null (→ caller serves the plain shell) for an
// unknown/dead share, a non-HTML asset, or any error — this is a best-effort enhancement
// that must never break the page. The DB read is the same capability-by-id trust model as
// the public share reader (readLiveShare returns null for revoked/expired).
async function injectShareOg(
  env: WorkerEnv,
  request: Request,
  origin: string,
  id: string,
): Promise<Response | null> {
  try {
    const share = await readLiveShare(env, id)
    if (!share) return null
    const meta = shareOgMeta(share.kind, share.label, share.payload, origin, id)
    if (!meta) return null
    const shell = await env.ASSETS.fetch(request)
    if (!(shell.headers.get('content-type') ?? '').includes('text/html')) return null
    const shareUrl = `${origin}/partage/${id}`
    const ogTags =
      `<meta property="og:title" content="${escAttr(meta.title)}">` +
      `<meta property="og:description" content="${escAttr(meta.description)}">` +
      `<meta property="og:type" content="website">` +
      `<meta property="og:site_name" content="Babillard">` +
      `<meta property="og:url" content="${escAttr(shareUrl)}">` +
      `<meta property="og:locale" content="fr_CA">` +
      `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">` +
      (meta.image
        ? `<meta property="og:image" content="${escAttr(meta.image)}">` +
          `<meta name="twitter:image" content="${escAttr(meta.image)}">`
        : '')
    return new HTMLRewriter()
      .on('title', {
        element(el) {
          el.setInnerContent(meta.title)
        },
      })
      .on('meta[name="description"]', {
        element(el) {
          el.setAttribute('content', meta.description)
        },
      })
      .on('head', {
        element(el) {
          el.append(ogTags, { html: true })
        },
      })
      .transform(shell)
  } catch {
    return null
  }
}

const app = {
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
    //
    // `wrangler dev` presents the custom-domain host (custom_domain route) to the
    // Worker even locally, for BOTH url.hostname AND the Host header — so a hostname
    // check alone reads dev as prod and bounces every /api + client-route to a
    // TLS-less https, hanging local dev. ENVIRONMENT=development (set only in
    // .dev.vars, unset in prod) is the reliable dev signal; in prod the redirect
    // still fires. (Edge "Always Use HTTPS" remains the real enforcement.)
    const isDev = env.ENVIRONMENT === 'development'
    const isLocal = isDev || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'http:' && !isLocal) {
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 301)
    }

    const path = url.pathname.replace(/^\/+/, '')

    // /tv/<code> — the easy living-room TV link. A short, hand-typeable code (minted with
    // a display device, Réglages ▸ Partage ▸ Au salon) is traded here for a FRESH read-only
    // display token and 302'd to the real /cast page — so a TV never needs the long
    // ?display=<token> URL typed by hand. The token is re-minted on the fly (stateless HMAC)
    // and stays revocable by deviceId, so revoking the TV kills its /tv link too. Unknown or
    // revoked code → a small honest 404 rather than the SPA shell.
    if (path.startsWith('tv/')) {
      const code = decodeURIComponent(path.slice('tv/'.length).replace(/\/+$/, ''))
      const tv = await resolveTvCode(env, code)
      if (!tv) {
        return new Response('Lien TV introuvable ou révoqué.', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }
      const token = await issueDeviceToken(env, tv.deviceId, tv.householdId)
      const dest = new URL('/cast', url.origin)
      if (tv.scene === 'ambient') dest.searchParams.set('scene', 'ambient')
      dest.searchParams.set('display', token)
      dest.searchParams.set('hh', tv.householdId)
      return Response.redirect(dest.toString(), 302)
    }

    // « Partager » link-preview (#share): a GET for /partage/<id> is the SPA shell, but
    // a crawler (Messages / Messenger / WhatsApp) reads only the initial HTML — so inject
    // per-share Open Graph tags before serving it, else the link unfurls as a generic
    // « Babillard ». Fail-open: an unknown/dead share or any error → the untouched shell.
    if (request.method === 'GET' && path.startsWith('partage/')) {
      const id = path.slice('partage/'.length).replace(/\/+$/, '')
      if (id && !id.includes('/')) {
        const injected = await injectShareOg(env, request, url.origin, id)
        if (injected) return injected
      }
    }

    // Everything that isn't an API call is the SPA. The assets binding serves a
    // real file when one matches, else index.html (SPA fallback) for client routes.
    if (!path.startsWith('api/')) {
      const res = await env.ASSETS.fetch(request)

      // …but /assets/* is the hashed build output, never a client route, so the
      // SPA fallback is WRONG there: a stale shell asking for a previous build's
      // chunk would get 200 + index.html instead of a 404, and a browser (or our
      // service worker's cache-first asset handler) would happily store HTML under
      // a .js URL — after which the entry module never parses and the app boots
      // blank forever. A missing chunk must fail as a missing chunk.
      if (path.startsWith('assets/') && res.headers.get('content-type')?.includes('text/html')) {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
      }
      return res
    }

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
      // Resolve the actor BEFORE any upgrade. Two credential transports converge:
      //   • operator session cookie — rides the same-origin WS handshake auto-
      //     matically (preferred; nothing leaks in the URL).
      //   • device / guest token — the browser WebSocket API CANNOT set the
      //     X-Device-Token header, so a kiosk/babysitter passes it as ?t=<token>.
      // SECURITY TRADEOFF: a token in a URL can leak via access logs / referrer,
      // so the cookie path is preferred and this is the fallback for header-less
      // WS clients only. We do NOT weaken verification: the ?t= token is folded
      // onto a CLONED request's X-Device-Token header and run through the SAME
      // resolveActor() (HMAC verify + device-revocation/household DB checks) as
      // the normal header path — identical trust, just a different carrier. The
      // original `request` is left untouched for the DO upgrade forward below.
      const tokenParam = url.searchParams.get('t')
      let authRequest = request
      if (tokenParam && !request.headers.get('X-Device-Token')) {
        const headers = new Headers(request.headers)
        headers.set('X-Device-Token', tokenParam)
        authRequest = new Request(request.url, { headers, method: request.method })
      }
      const actor = await resolveActor(env, authRequest)
      // 401 before any upgrade when the credential is missing/invalid/expired.
      if (!actor) return new Response('Not signed in.', { status: 401 })
      // Per-kind scope boundary for the realtime fan-out: a curated GUEST link is a
      // read-only terminal snapshot (sitter/welcome/family/showcase) that polls its own
      // one endpoint — it must not join the household hub and receive invalidate nudges
      // about activity it can't read. The normal path's `guestKindAllows` allowlist has
      // no 'live' entry for any kind, so this mirrors it: only operator/kiosk devices
      // open a socket; a guest falls back to polling (the client won't even try — see
      // lib/realtime connectRealtime).
      if (actor.scope === 'guest') return forbidden('Realtime not available for this share link.')

      // « Voyage partagé » (#shared-trip) — a SECOND, page-scoped socket that a
      // shared-trip page opens as /api/live?st=<id>. The room is the SHARED TRIP,
      // not a household, so operators from up to 6 different households land on ONE
      // DO and see each other's edits live. SECURITY: the ?st= value is just an id,
      // NOT a capability — it grants nothing on its own. The authorization is a LIVE
      // shared_trip_members row (checked against D1 below), exactly like every
      // /api/shared-trip* handler; a stray/rotated/guessed id 403s before any
      // upgrade. The `st:` prefix keeps the DO namespace DISJOINT from household ids
      // (idFromName('st:'+id) can never collide into a household's room). v1 is
      // operator-only: a kiosk device doesn't watch shared trips, so we reject any
      // non-operator scope here rather than membership-check a device.
      const st = url.searchParams.get('st')
      if (st) {
        if (actor.scope !== 'operator') {
          return forbidden('Shared trips are operator-only.')
        }
        if (!env.REALTIME_HUB) {
          // DO not deployed/eligible — tell the client to stick with polling.
          return new Response('Realtime unavailable.', { status: 503 })
        }
        // The one authorization check: a live grant (revoked_at IS NULL) to a live
        // trip (deleted_at IS NULL) for THIS operator's household. Miss → 403.
        const member = await env.DB.prepare(
          'SELECT 1 FROM shared_trip_members m JOIN shared_trips t ON t.id = m.shared_trip_id ' +
            'WHERE m.shared_trip_id = ?1 AND m.household_id = ?2 ' +
            'AND m.revoked_at IS NULL AND t.deleted_at IS NULL',
        )
          .bind(st, actor.householdId)
          .first()
        if (!member) return forbidden('Not a member of this shared trip.')
        const stId = env.REALTIME_HUB.idFromName('st:' + st)
        const stStub = env.REALTIME_HUB.get(stId)
        return stStub.fetch(request)
      }

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

    // 1.5 Per-kind guest scope (the share-mode privacy boundary). A guest token
    //     is verified HMAC-only here (no DB) just to read its `kind`; a curated
    //     link (sitter / welcome) may reach ONLY its own endpoint — anything else
    //     403s before the handler runs. A kiosk/operator carries no `g` payload so
    //     currentGuest returns null and this is skipped (no extra DB cost on the
    //     hot polling path). authed() still does the real auth + write-block inside
    //     each handler. /api/live is handled above and only carries refresh nudges.
    const guest = await currentGuest(env, request)
    if (guest && !guestKindAllows(guest.kind, apiPath)) {
      return forbidden('This share link can’t open that.')
    }

    const matched = matchRoute(apiPath)
    if (!matched) return notFound()
    const handler = pickHandler(matched.mod, request.method)
    if (!handler) return methodNotAllowed()

    // The MCP endpoint's `?t=` carrier — the same concession /api/live makes above,
    // for the same reason and with the same trust: the token is folded onto a CLONED
    // request's X-Device-Token header and goes through the SAME resolveActor (HMAC
    // verify + revocation + household checks). Nothing is weakened; only the carrier
    // differs. It exists because an MCP client cannot always set a custom header
    // (anthropics/claude-code#29562), exactly as a browser WebSocket cannot.
    //
    // Scoped to 'mcp' ON PURPOSE. Promoting `?t=` for every route would turn every
    // endpoint into one reachable by a URL alone — pasteable into a chat, logged by
    // every proxy, and sitting in browser history. One route opts in.
    let apiRequest = request
    if (apiPath === 'mcp') {
      const t = url.searchParams.get('t')
      if (t && !request.headers.get('X-Device-Token')) {
        const headers = new Headers(request.headers)
        headers.set('X-Device-Token', t)
        apiRequest = new Request(request.url, { headers, method: request.method, body: request.body })
      }
    }

    // Adapt the Worker request into the EventContext the Pages handler expects.
    // Handlers use only request / env / params; the rest is provided for shape.
    const context: EventContext<Env, string, { householdId?: string }> = {
      request: apiRequest,
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

  // The nightly cron (wrangler.toml [triggers]) — functions/_lib/nightly.ts: the
  // backup of every household to R2 (bmad/08 E-36: the cheap insurance against a
  // migration bug eating the only real household — `backup/<id>/<date>.json`, the
  // takeout dump, newest 14 kept), the sandbox sweep, and ONE email through the mail
  // seam when anything failed or a stale sandbox survived (STATE §4-L L7) — plus a
  // Monday « Babillard va bien » so the alert channel is itself exercised.
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(nightly(env))
  },
} satisfies ExportedHandler<WorkerEnv>

// The deploy target. Every response — the SPA shell, a hashed asset, a JSON answer, a
// redirect — leaves through withSecurityHeaders (STATE.md §4-L L6); the one exception
// is the 101 of a WebSocket upgrade, which the helper returns untouched.
export default {
  async fetch(request, env, ctx): Promise<Response> {
    return withSecurityHeaders(await app.fetch(request, env, ctx))
  },
  scheduled: app.scheduled,
} satisfies ExportedHandler<WorkerEnv>
