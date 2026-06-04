import type { Env } from '../_lib/env'
import { ok } from '../_lib/json'

// Liveness + a peek at which optional bindings are wired, so the operator hub
// can show "voice available / degraded" honestly.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  return ok({
    ok: true,
    app: ctx.env.APP_NAME ?? 'Babillard',
    ai: !!ctx.env.AI,
    sessionSecret: !!ctx.env.SESSION_SECRET && ctx.env.SESSION_SECRET.length >= 32,
  })
}
