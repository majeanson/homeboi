// Server-side realtime broadcast hook (SCAFFOLD, #20).
//
// After a successful write, a handler (or the authed() wrapper) can call
// broadcastInvalidate() to tell the household's RealtimeHub Durable Object to
// fan out a query-invalidate to every connected client. This is an OPTIMIZATION:
// it is BEST-EFFORT and FULLY WRAPPED so a DO error, a missing binding, or a slow
// network can NEVER fail or delay the write — the function swallows everything.
//
// The DO binding lives on the Worker env (REALTIME_HUB) and is intentionally NOT
// on the Functions `Env` type (it's optional + Worker-only), so this helper takes
// a loosely-typed env and feature-detects the binding at runtime.

// Minimal structural type for the bits we touch — avoids importing Worker-only DO
// types into the Functions layer, and lets the call no-op when the binding is absent.
interface MaybeRealtimeEnv {
  REALTIME_HUB?: {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> }
  }
}

// Fire the invalidate at the household's hub. Returns a promise the caller MAY
// pass to ctx.waitUntil() (so it runs after the response flushes), but awaiting
// it is optional and never throws.
export async function broadcastInvalidate(env: unknown, householdId: string, keys: string[][]): Promise<void> {
  try {
    const hub = (env as MaybeRealtimeEnv).REALTIME_HUB
    if (!hub) return // binding not provisioned → polling covers it
    const stub = hub.get(hub.idFromName(householdId))
    await stub.fetch('https://do/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'invalidate', keys }),
    })
  } catch {
    // Never let realtime failure touch the write path. Polling is the fallback.
  }
}
