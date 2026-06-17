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
import { forbidden, serverError } from './json'
import { withIdempotency } from './idempotency'
import { broadcastInvalidate } from './realtime'

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
export function authed(handler: ActorHandler, scope?: 'operator'): PagesFunction<Env> {
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
      // Offline-queue dedup: a replayed write carries an Idempotency-Key, so the
      // same queued action never double-applies. Online writes send no key and
      // run straight through. GET/HEAD are never queued. See idempotency.ts.
      const idemKey = ctx.request.headers.get('Idempotency-Key')
      const res =
        idemKey && method !== 'GET' && method !== 'HEAD'
          ? await withIdempotency(ctx.env, actor.householdId, idemKey, () => handler(ctx, actor))
          : await handler(ctx, actor)

      // Realtime broadcast HOOK (SCAFFOLD, #20). After a SUCCESSFUL write, nudge
      // the household's RealtimeHub so awake clients refetch at once instead of
      // waiting for the next poll. BEST-EFFORT + fail-safe: broadcastInvalidate
      // swallows every error and the DO binding is optional, so this can never
      // fail or delay the write. Runs after the response flushes via waitUntil.
      //
      // Coverage note: this fires a GENERIC board-key invalidate for ALL writes
      // — correct (a superset refetch) but coarse. TODO(#20): pass per-endpoint
      // keys (e.g. [['list']] from the list handler) for finer-grained refetch.
      if (!SAFE_METHODS.has(method) && res.status >= 200 && res.status < 300) {
        const fire = broadcastInvalidate(ctx.env, actor.householdId, [['board']])
        // Prefer waitUntil so the broadcast runs after the response flushes; fall
        // back to a fire-and-forget when it's absent (e.g. unit-test ctx). The
        // helper already swallows all errors, so the dangling promise can't throw.
        if (typeof ctx.waitUntil === 'function') ctx.waitUntil(fire)
        else void fire
      }
      return res
    } catch (err) {
      const { method, url } = ctx.request
      console.error(`[${method} ${new URL(url).pathname}]`, err)
      return serverError()
    }
  }
}
