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
import { runWithRequest } from './tz'
import { isSandboxEmail } from './demoHousehold'
import { nowSec } from './ids'
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
// READ-ONLY POST (`{ readOnlyPost: true }`): for the one handler whose POST performs
// no write — the MCP server (functions/api/mcp.ts), which is a JSON-RPC endpoint and
// so must be POSTed to even though every tool behind it is a GET. Without this, the
// read-only device kinds below would be blocked from reaching the very server that
// exists to serve them. It relaxes ONLY the device-kind gate: the guest block still
// applies, and nothing here grants a write — the handler has no write path to reach.
export function authed(
  handler: ActorHandler,
  scope?: 'operator',
  opts?: { requiresAi?: boolean; readOnlyPost?: boolean },
): PagesFunction<Env> {
  return async (ctx) => {
    try {
      const actor = await requireActor(ctx.env, ctx.request, scope)
      if (actor instanceof Response) return actor
      const method = ctx.request.method
      // Guest = read-only. Block every non-safe method up front; never reaches
      // the handler, so no write path is exposed to a babysitter credential.
      // SOLE exceptions: the WRITABLE guest kinds — 'intake' (the family-info form)
      // and 'postbox' (« La boîte aux lettres »). The path allowlist in guestScope.ts
      // already pins each to its own submit/media endpoints, so this carve-out can't
      // widen into other handlers.
      if (
        actor.scope === 'guest' &&
        actor.guestKind !== 'intake' &&
        actor.guestKind !== 'postbox' &&
        !SAFE_METHODS.has(method)
      ) {
        return forbidden('Guest access is read-only.')
      }
      // The read-only device kinds — a 'display' (a living-room TV showing /cast
      // forever) and an 'agent' (an MCP client) — are read-only kiosks: same stance
      // as a guest, enforced centrally so no write path leaks. Their only privilege
      // over a guest is permanence + revocability (a devices row). `readOnlyPost`
      // exempts the MCP endpoint itself, whose POST is a read (see above).
      if (
        actor.scope === 'kiosk' &&
        (actor.deviceKind === 'display' || actor.deviceKind === 'agent') &&
        !SAFE_METHODS.has(method) &&
        !opts?.readOnlyPost
      ) {
        return forbidden('Display access is read-only.')
      }
      // AI off (binding unset or household-disabled) → 503 before the handler runs.
      if (opts?.requiresAi && !(await aiUsable(ctx.env, actor))) {
        return serviceUnavailable('IA indisponible.')
      }
      // Idempotency dedup: every mutating writeWith call carries an Idempotency-Key
      // now (B-9, bmad/10) — the online attempt and a queued/replayed write reuse
      // the SAME key, so a lost-response double-tap or an outbox replay never
      // double-applies regardless of which leg lands. GET/HEAD are never queued
      // and carry no key. See idempotency.ts.
      // THE HOUSEHOLD'S ZONE, for everything below (migration 0135, _lib/tz.ts). Every
      // day helper in ids.ts defaults to this ambient, so a handler — and the pure
      // modules under it — get the right day boundary without threading a parameter
      // through ~190 call sites. AsyncLocalStorage, so two concurrent requests from two
      // households can never read each other's.
      const idemKey = ctx.request.headers.get('Idempotency-Key')
      const res = await runWithRequest({ tz: actor.tz, householdId: actor.householdId, sandbox: !!actor.email && isSandboxEmail(actor.email) }, async () =>
        idemKey && method !== 'GET' && method !== 'HEAD'
          ? await withIdempotency(ctx.env, actor.householdId, idemKey, () => handler(ctx, actor))
          : await handler(ctx, actor),
      )

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
        // A SANDBOX THAT WAS ACTUALLY USED SAYS SO (Wave 5, 2026-09-23). The demo cap
        // counts sandboxes that EXIST, not sandboxes anyone is using, so ten probes with
        // no open board filled it for a full day — measured, not imagined. The early
        // sweep needs to tell a visitor who tried the app from one who bounced, and the
        // only exact signal is the household saying « someone wrote here ».
        //
        // Scoped to sandboxes on purpose: a real household would pay an extra UPDATE on
        // every write for a number nothing reads. Fire-and-forget beside the broadcast,
        // for the same reason — it must never delay or fail a write.
        if (actor.email && isSandboxEmail(actor.email)) {
          const touch = ctx.env.DB.prepare('UPDATE households SET updated_at = ? WHERE id = ?')
            .bind(nowSec(), actor.householdId)
            .run()
            .catch(() => {
              /* an un-stamped sandbox is swept early at worst; never fail the write */
            })
          if (typeof ctx.waitUntil === 'function') ctx.waitUntil(touch)
          else void touch
        }

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
