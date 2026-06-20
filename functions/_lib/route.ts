// Handler plumbing — the one place that knows how an authed endpoint is wired,
// so individual handlers stay pure business logic.
//
// Every household endpoint shares the same preamble: resolve the actor, bail
// with 401/403 if it's missing or under-privileged, then run. Hand-rolling that
// in each handler (the `const actor = await requireActor(...); if (actor
// instanceof Response) return actor` dance) meant ~30 copies and one forgotten
// guard away from an unauthenticated write. `authed()` makes the guard
// structural: you literally can't get an `actor` without having passed it.
//
// It also adds the error boundary the per-handler version never had — a thrown
// D1/JSON error becomes a clean 500 with a server-side log, not a leaked stack.

import type { Env, Ctx } from './env'
import { type Actor, requireActor } from './household'
import { aiUsable } from './aiPref'
import { forbidden, serverError, serviceUnavailable } from './json'
import { withIdempotency } from './idempotency'
import { broadcastInvalidate, keysForPath } from './realtime'

// A handler that has already cleared auth: it receives the resolved actor
// alongside the usual context, and returns (or resolves to) a Response.
export type ActorHandler = (ctx: Ctx, actor: Actor) => Response | Promise<Response>

const SAFE_METHODS = new Set(['GET', 'HEAD'])

// Wrap a handler so it only runs for a valid actor. Pass `'operator'` to reject
// kiosk AND guest devices (member admin, billing, destructive ops) — `'operator'`
// means strictly the signed-in human. Anything the handler throws is caught and
// logged, never surfaced to the client as a raw stack.
//
// GUEST RULE (babysitter mode, strictly narrower than a kiosk): a guest actor may
// only GET/HEAD. ANY mutating method (POST/PATCH/PUT/DELETE) by a guest is blocked
// here, centrally — so every existing mutating handler rejects guests without a
// per-handler change, and a new handler can't forget the guard. requireActor's
// `'operator'` scope already excludes guests; this catches the unscoped reads'
// sibling writes (a module exports GET + POST from one file).
//
// AI RULE (Réglages ▸ IA off switch): pass `{ requiresAi: true }` for an endpoint
// that can't do anything useful without Workers AI (transcribe, recipe-vision,
// recap, …). It 503s — the same status these handlers already returned for an
// unset binding, so the SPA's existing degrade paths handle it — when either the
// binding is absent OR the household switched AI off (aiUsable folds both). The
// gate is structural, like the auth guard: an AI endpoint can't forget the off
// switch. Soft-degrade endpoints (capture/ask/recipe-import/deals) DON'T set this —
// they call aiUsable() inline and fall back instead of erroring.
export function authed(
  handler: ActorHandler,
  scope?: 'operator',
  opts?: { requiresAi?: boolean },
): PagesFunction<Env> {
  return async (ctx) => {
    try {
      const actor = await requireActor(ctx.env, ctx.request, scope)
      if (actor instanceof Response) return actor
      const method = ctx.request.method
      // Guest = read-only. Block every non-safe method up front; never reaches
      // the handler, so no write path is exposed to a babysitter credential.
      if (actor.scope === 'guest' && !SAFE_METHODS.has(method)) {
        return forbidden('Guest access is read-only.')
      }
      // AI off (binding unset or household-disabled) → 503 before the handler runs.
      if (opts?.requiresAi && !(await aiUsable(ctx.env, actor))) {
        return serviceUnavailable('IA indisponible.')
      }
      // Offline-queue dedup: a replayed write carries an Idempotency-Key, so the
      // same queued action never double-applies. Online writes send no key and
      // run straight through. GET/HEAD are never queued. See idempotency.ts.
      const idemKey = ctx.request.headers.get('Idempotency-Key')
      const res =
        idemKey && method !== 'GET' && method !== 'HEAD'
          ? await withIdempotency(ctx.env, actor.householdId, idemKey, () => handler(ctx, actor))
          : await handler(ctx, actor)

      // Realtime broadcast HOOK (#20). After a SUCCESSFUL write, nudge the
      // household's RealtimeHub so awake clients refetch at once instead of
      // waiting for the next poll. BEST-EFFORT + fail-safe: broadcastInvalidate
      // swallows every error and the DO binding is optional, so this can never
      // fail or delay the write. Runs after the response flushes via waitUntil.
      //
      // Per-write keys: keysForPath maps THIS endpoint to exactly the caches a
      // write to it touches (mirrors the SPA's affectedKeys), so the push is
      // fine-grained — an unmapped board-affecting write still defaults to the
      // board key, and endpoints that change no shared cache broadcast nothing.
      if (!SAFE_METHODS.has(method) && res.status >= 200 && res.status < 300) {
        // ctx.request.url is the full request URL; keysForPath strips the origin
        // + /api/ prefix + query string itself, so a raw pathname is fine here.
        const apiPath = (() => {
          try {
            return new URL(ctx.request.url).pathname
          } catch {
            return ctx.request.url
          }
        })()
        const keys = keysForPath(apiPath)
        if (keys.length > 0) {
          const fire = broadcastInvalidate(ctx.env, actor.householdId, keys)
          // Prefer waitUntil so the broadcast runs after the response flushes; fall
          // back to a fire-and-forget when it's absent (e.g. unit-test ctx). The
          // helper already swallows all errors, so the dangling promise can't throw.
          if (typeof ctx.waitUntil === 'function') ctx.waitUntil(fire)
          else void fire
        }
      }
      return res
    } catch (err) {
      const { method, url } = ctx.request
      console.error(`[${method} ${new URL(url).pathname}]`, err)
      return serverError()
    }
  }
}
