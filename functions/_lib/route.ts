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
import { serverError } from './json'

// A handler that has already cleared auth: it receives the resolved actor
// alongside the usual context, and returns (or resolves to) a Response.
export type ActorHandler = (ctx: Ctx, actor: Actor) => Response | Promise<Response>

// Wrap a handler so it only runs for a valid actor. Pass `'operator'` to reject
// kiosk devices (member admin, billing, destructive ops). Anything the handler
// throws is caught and logged, never surfaced to the client as a raw stack.
export function authed(handler: ActorHandler, scope?: 'operator'): PagesFunction<Env> {
  return async (ctx) => {
    try {
      const actor = await requireActor(ctx.env, ctx.request, scope)
      if (actor instanceof Response) return actor
      return await handler(ctx, actor)
    } catch (err) {
      const { method, url } = ctx.request
      console.error(`[${method} ${new URL(url).pathname}]`, err)
      return serverError()
    }
  }
}
