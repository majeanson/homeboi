// DEV-ONLY. The gallery's "show me this card with data in it" switch.
//
// Why it exists: the DevKit parity audit (2026-09-09) had to excuse ~22 shared
// components from the gallery with « needs live household data » — board cards, the
// month and year grids, both toddler surfaces. They are the components most worth
// LOOKING at across theme × lens × locale, and they were the ones you could not look
// at without a seeded household. That is backwards.
//
// It reuses `e2e/mocks.ts`'s `ROUTES` rather than inventing a second fixture set. That
// file is 1200 lines of deterministic, actively-maintained payloads for every endpoint
// — the alternative was a parallel copy that drifts, which is the exact failure this
// whole audit was about. Fixtures stay owned by the e2e suite; the gallery borrows.
//
// SHIPPING: everything here sits behind `import.meta.env.DEV`, which Vite replaces with
// `false` in a production build, so the dynamic import below is dead code and the
// fixtures never reach the deployed bundle. `npm run check:bundle` is the proof — the
// DevKit chunk must not grow by the weight of e2e/mocks.ts.

export type FixtureRoutes = Record<string, unknown>

let cached: FixtureRoutes | null = null

/** The e2e fixture payloads, or null in a production build (where they don't exist). */
export async function loadFixtureRoutes(): Promise<FixtureRoutes | null> {
  if (!import.meta.env.DEV) return null
  if (cached) return cached
  const mod = await import('../../e2e/mocks')
  cached = mod.ROUTES
  return cached
}

/**
 * Serve `/api/*` GETs from the fixtures for as long as the returned function is
 * un-called. Writes answer `{ok:true}` — the gallery is for looking, and a specimen
 * that POSTs should not reach the household whose browser is showing it.
 *
 * Patches `window.fetch` rather than seeding the Query cache: the fixtures are keyed by
 * REQUEST PATH, which is what `api()` speaks, while every card bakes its own queryFn and
 * query key. Path-keyed data + a path-level intercept means no per-card wiring and no
 * second map to keep in step (`lib/queryKeys` ↔ these paths) that could rot silently.
 */
export function installFixtureFetch(routes: FixtureRoutes): () => void {
  const real = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    if (!path.startsWith('/api/')) return real(input, init)

    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

    if (method !== 'GET' && method !== 'HEAD') return json({ ok: true })

    // Match on the path START so a query string (?view=manage, ?id=…) still hits, and
    // prefer the LONGEST match so `cercle/import` never resolves to `cercle`.
    const suffix = path.slice('/api/'.length).split('?')[0]
    const hit = Object.keys(routes)
      .filter((k) => suffix === k || suffix.startsWith(k + '/') || suffix.startsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    return json(hit ? routes[hit] : {})
  }
  return () => {
    window.fetch = real
  }
}
