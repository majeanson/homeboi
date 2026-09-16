import { describe, it, expect } from 'vitest'
import { ROUTES } from './routes'
import { ID_FIELDS } from '../functions/test/idFields'
import { dump, household, idsOf, type Session } from '../functions/test/d1'

// THE TENANT-ISOLATION SWEEP (STATE.md §4-L, item L3 — the one bug a public app cannot
// survive, and until 2026-09-16 the one nothing held).
//
// Two real households, A and B, through the real signup. B then walks EVERY route in
// the Worker's table with EVERY method its module handles, naming A's ids in every
// id-shaped field a handler reads (functions/test/idFields.ts, kept complete by a
// grep guard) — in the query string for reads, in the body AND the query for writes.
// Three things must hold:
//
//   1. no response B receives contains any of A's ids or A's marker text;
//   2. A's whole content (the takeout dump) is byte-for-byte what it was before;
//   3. nothing answered 500 (a thrown handler), except the routes that call OUT to the
//      internet (there is no outbound mock in this harness; a garbage flyer lookup may
//      well fail). 503 is a deliberate answer — AI off, R2 or mail unset — and is fine.
//
// One id per table is enough: an isolation hole is per (route, table), not per row.
// Proven red on 2026-09-16 by deleting one `AND household_id = ?` from a handler.

// Routes whose handler fetches an outside service (deals/flyers/weather/imports): a
// 5xx here is the internet, not a leak. Each one still runs — assertion 1 and 2 hold
// for them too — only the "no 500" check is relaxed. Keep this list SHORT and named.
const OUTBOUND = new Set([
  'deals',
  'flyer',
  'flyers',
  'flyer-img',
  'place-import',
  'recipe-import',
  'weather',
  'wonder',
  'transcribe',
  'recipe-vision',
])

// Routes B walks with NO session at all — they are the ones that mint one — and the
// blob route. Named here so a new unauthenticated route is a decision, not a default.
const SKIP = new Set(['auth/login', 'auth/signup', 'auth/logout', 'auth/forgot', 'auth/reset', 'pair/start', 'pair/poll', 'demo', 'demo/claim', 'operator-join'])

function oneIdPerTable(t: Awaited<ReturnType<typeof dump>>): string[] {
  const out: string[] = [t.householdId]
  for (const rows of Object.values(t.tables)) {
    const first = rows.find((r) => typeof r.id === 'string' && r.id)
    if (first) out.push(first.id as string)
  }
  return out
}

interface Hit {
  route: string
  method: string
  id: string
  status: number
  leaked: string[]
}

async function attack(b: Session, route: string, method: string, id: string, marker: string, aIds: Set<string>): Promise<Hit> {
  const query = ID_FIELDS.map((f) => `${f}=${encodeURIComponent(id)}`).join('&')
  const body = Object.fromEntries(ID_FIELDS.map((f) => [f, id]))
  const res = await b.fetch(`/api/${route}?${query}`, method === 'GET' ? {} : { method, body })
  const text = await res.text()
  const leaked: string[] = []
  if (text.includes(marker)) leaked.push('marker')
  for (const aid of aIds) if (aid.length >= 8 && text.includes(aid)) leaked.push(aid)
  return { route, method, id, status: res.status, leaked }
}

describe('tenant isolation', () => {
  it('household B, naming A’s ids on every route and method, neither reads nor changes A', async () => {
    const a = await household('alpha')
    const b = await household('bravo')
    // AI off for both, structurally: aiUsable() gates every AI endpoint on this switch,
    // and the harness has no way to unbind Workers AI (which is remote even locally).
    for (const s of [a, b]) expect((await s.fetch('/api/household', { method: 'PATCH', body: { aiEnabled: false } })).status).toBe(200)
    const health = (await (await b.fetch('/api/health')).json()) as { ai: boolean }
    expect(health.ai, 'AI must be off for the sweep household').toBe(false)

    // A marker only A holds: its household name and one fridge note.
    const marker = `MARQUE-${a.householdId}-ZZ`
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { name: marker } })).status).toBe(200)
    expect((await a.fetch('/api/notes', { method: 'POST', body: { text: marker } })).status).toBeLessThan(300)

    const before = await dump(a.householdId)
    const aIds = new Set(idsOf(before))
    const targets = oneIdPerTable(before)
    expect(targets.length, 'the seeded household must have rows to name').toBeGreaterThan(10)

    const hits: Hit[] = []
    const jobs: Array<() => Promise<void>> = []
    for (const { path, methods } of ROUTES) {
      if (SKIP.has(path)) continue
      for (const method of methods) for (const id of targets) jobs.push(async () => void hits.push(await attack(b, path, method, id, marker, aIds)))
    }
    // Bounded concurrency: workerd handles parallel requests, D1 serialises writes.
    const WORKERS = 8
    let next = 0
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        while (next < jobs.length) await jobs[next++]()
      }),
    )

    const leaks = hits.filter((h) => h.leaked.length).map((h) => `${h.method} ${h.route} (id ${h.id}) → ${h.status}: ${h.leaked.join(', ')}`)
    expect(leaks, 'B read something of A’s').toEqual([])

    const after = await dump(a.householdId)
    // exportedAt is the dump's own clock — not content.
    expect({ ...after, exportedAt: 0 }, 'A’s content changed under B’s requests').toEqual({ ...before, exportedAt: 0 })

    // 500 only: a 503 is a deliberate answer (AI off → « IA indisponible », R2/mail unset).
    const crashes = [...new Set(hits.filter((h) => h.status === 500 && !OUTBOUND.has(h.route)).map((h) => `${h.method} ${h.route} → ${h.status}`))]
    expect(crashes, 'a 500 is a handler that did not expect a foreign id').toEqual([])

    // For the log: how many doors were knocked on.
    expect(hits.length).toBeGreaterThan(1000)
  })
})
