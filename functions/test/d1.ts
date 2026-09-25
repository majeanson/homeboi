import { env, exports } from 'cloudflare:workers'
import { dumpHousehold, type Takeout } from '../_lib/takeout'

// Helpers for the real-runtime harness (vitest.d1.config.ts, STATE.md §4-L L3).
//
// Everything goes through the REAL Worker entry (`exports.default.fetch`), so every
// request pays the CSRF gate, the guest-scope gate, the route table and authed() —
// the same path production takes. A helper never reaches into a handler.

export const ORIGIN = 'https://babillard.test'

export interface Session {
  email: string
  householdId: string
  cookie: string
  csrf: string
  // A fetch that carries the session cookie + the CSRF echo (and JSON-encodes a body).
  fetch: (path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) => Promise<Response>
}

let seq = 0

// The raw Worker fetch — no session, no CSRF.
export function anon(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<Response> {
  const headers = new Headers(init?.headers)
  let body: string | undefined
  if (init?.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(init.body)
  }
  // `exports.default` is the Worker's own default export as a Fetcher (the plugin runs
  // main in this isolate); the pinned workers-types have no `Exports` shape for it.
  return (exports as unknown as { default: Fetcher }).default.fetch(`${ORIGIN}${path}`, { method: init?.method ?? 'GET', headers, body })
}

function cookiesFrom(res: Response): { cookie: string; csrf: string } {
  // getSetCookie() exists in workerd; the pinned workers-types predate it.
  const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
  const pick = (name: string) => set.find((c: string) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1) ?? ''
  const session = pick('bb_session')
  const csrf = pick('bb_csrf')
  if (!session || !csrf) throw new Error(`no session cookies on ${res.status}: ${set.join(' | ')}`)
  return { cookie: `bb_session=${session}; bb_csrf=${csrf}`, csrf }
}

function sessionFrom(email: string, householdId: string, c: { cookie: string; csrf: string }): Session {
  return {
    email,
    householdId,
    cookie: c.cookie,
    csrf: c.csrf,
    fetch: (path, init) =>
      anon(path, {
        ...init,
        headers: { ...init?.headers, Cookie: c.cookie, 'X-CSRF-Token': c.csrf },
      }),
  }
}

// A brand-new household through the real signup endpoint (INVITE_CODE is unset in
// the harness, so signup is open — the same shape as local dev). Production signup
// starts EMPTY since 2026-09-23 (the examples moved to the demo sandbox), so a test
// that needs a lived-in household — rows in most tables, which the isolation sweep
// depends on — gets the examples through the same door an operator uses
// (POST /api/seed). `{ empty: true }` keeps what signup alone gives.
export async function household(
  label = 'test',
  password = 'correct horse battery',
  opts: { empty?: boolean } = {},
): Promise<Session & { password: string }> {
  const email = `${label}-${Date.now()}-${++seq}@d1.test`
  const res = await anon('/api/auth/signup', { method: 'POST', body: { email, password, householdName: `Maisonnée ${label}` } })
  if (res.status !== 201) throw new Error(`signup ${res.status}: ${await res.text()}`)
  const c = cookiesFrom(res)
  const me = await anon('/api/auth/me', { headers: { Cookie: c.cookie } })
  const who = (await me.json()) as { household?: { id: string } }
  if (!who.household) throw new Error('signup did not sign in')
  const s = { ...sessionFrom(email, who.household.id, c), password }
  if (!opts.empty) {
    const seeded = await s.fetch('/api/seed', { method: 'POST' })
    if (seeded.status !== 200) throw new Error(`seed ${seeded.status}: ${await seeded.text()}`)
  }
  return s
}

// Re-sign an existing account (a second device).
export async function login(email: string, password: string): Promise<Session> {
  const res = await anon('/api/auth/login', { method: 'POST', body: { email, password } })
  if (res.status !== 200) throw new Error(`login ${res.status}: ${await res.text()}`)
  const c = cookiesFrom(res)
  const me = await anon('/api/auth/me', { headers: { Cookie: c.cookie } })
  const who = (await me.json()) as { household?: { id: string } }
  return sessionFrom(email, who.household!.id, c)
}

// The household's whole content, through the same dump takeout + the nightly backup use.
export function dump(householdId: string): Promise<Takeout> {
  return dumpHousehold(env, householdId)
}

// Every id in a dump: the rows' own ids plus the household's.
export function idsOf(t: Takeout): string[] {
  const out = new Set<string>([t.householdId])
  for (const rows of Object.values(t.tables)) for (const r of rows) if (typeof r.id === 'string' && r.id) out.add(r.id)
  return [...out]
}
