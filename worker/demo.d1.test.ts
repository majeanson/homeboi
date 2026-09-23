import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon } from '../functions/test/d1'
import { countDemoSandboxes, DEMO_SANDBOX_IDLE_TTL, DEMO_SANDBOX_TTL } from '../functions/_lib/demoHousehold'

// The demo sandbox, end to end — including the sweep that could not delete ANY sandbox
// from migration 0102 until 2026-09-16, and that nobody noticed because nobody minted
// one (STATE.md §4-K Wave 1). This is the test that would have noticed.
describe('demo sandbox', () => {
  async function mint(): Promise<{ householdId: string; cookie: string; csrf: string }> {
    const res = await anon('/api/demo', { method: 'POST', headers: { 'CF-Connecting-IP': `10.0.0.${Math.floor(Math.random() * 250)}` } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { sandbox?: boolean }).sandbox).toBe(true)
    const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c: string) => c.split(';')[0])
    const cookie = set.join('; ')
    const me = (await (await anon('/api/auth/me', { headers: { Cookie: cookie } })).json()) as { signedIn: boolean; household?: { id: string } }
    expect(me.signedIn).toBe(true)
    // The CSRF echo too: a sandbox is a real session, so a WRITE through it needs the
    // double-submit like any other — which the idle-sweep test below depends on.
    const csrf = (cookie.match(/bb_csrf=([^;]+)/) ?? [])[1] ?? ''
    return { householdId: me.household!.id, cookie, csrf }
  }

  it('mints a seeded, writable sandbox with a real session', async () => {
    const s = await mint()
    expect((await anon('/api/board', { headers: { Cookie: s.cookie } })).status).toBe(200)
    expect(await countDemoSandboxes(env)).toBeGreaterThanOrEqual(1)
  })

  it('the next mint sweeps a sandbox older than the TTL — and leaves nothing of it', async () => {
    const old = await mint()
    // Age it past the TTL the way a day would.
    await env.DB.prepare('UPDATE households SET created_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000) - DEMO_SANDBOX_TTL - 3600, old.householdId)
      .run()
    const before = await countDemoSandboxes(env)
    await mint()
    expect(await countDemoSandboxes(env)).toBe(before) // one swept, one minted
    const gone = await env.DB.prepare('SELECT id FROM households WHERE id = ?').bind(old.householdId).first()
    expect(gone).toBeNull()
    // Its operator row was the session's kill switch.
    expect((await anon('/api/board', { headers: { Cookie: old.cookie } })).status).toBe(401)
    // And no orphan rows remain in the tables the sweep inventories.
    for (const table of ['members', 'recipes', 'events', 'tasks', 'routines', 'notes', 'list_items']) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE household_id = ?`).bind(old.householdId).first<{ n: number }>()
      expect(row?.n, table).toBe(0)
    }
  })

  // ── The IDLE sweep (2026-09-23). The cap counts sandboxes that exist, not sandboxes
  // anyone is using: ten probes with no open board filled it for a full day, and the
  // demo fell back to read-only for every real visitor meanwhile. These two tests are
  // the fix's whole contract — bounce early, but never take something someone wrote.
  it('sweeps an UNTOUCHED sandbox after the short TTL, long before the full one', async () => {
    const idle = await mint()
    // Two hours old, never written to: `updated_at` still equals `created_at`, which is
    // exactly the state a seeded-but-abandoned household is in.
    const twoHoursAgo = Math.floor(Date.now() / 1000) - DEMO_SANDBOX_IDLE_TTL - 60
    await env.DB.prepare('UPDATE households SET created_at = ?, updated_at = ? WHERE id = ?')
      .bind(twoHoursAgo, twoHoursAgo, idle.householdId)
      .run()

    await mint()
    const gone = await env.DB.prepare('SELECT id FROM households WHERE id = ?').bind(idle.householdId).first()
    expect(gone, 'an untouched sandbox should not hold a slot for a day').toBeNull()
  })

  it('KEEPS a sandbox of the same age that was actually used', async () => {
    // The half that matters more: someone who tried the app and closed the laptop must
    // still find their household after lunch. One real write is the whole difference.
    const used = await mint()
    const res = await anon('/api/list', {
      method: 'POST',
      body: { text: 'des œufs' },
      headers: { Cookie: used.cookie, 'X-CSRF-Token': used.csrf },
    })
    expect(res.status, 'the sandbox write itself must succeed').toBe(200)

    // Age it exactly like the idle one, but keep the stamp the write left — route.ts
    // bumps `updated_at` for a sandbox on every successful write, which is what makes
    // « touched » an exact fact instead of a guess about which tables to look in.
    const twoHoursAgo = Math.floor(Date.now() / 1000) - DEMO_SANDBOX_IDLE_TTL - 60
    await env.DB.prepare('UPDATE households SET created_at = ? WHERE id = ?').bind(twoHoursAgo, used.householdId).run()
    const stamp = await env.DB.prepare('SELECT created_at, updated_at FROM households WHERE id = ?')
      .bind(used.householdId)
      .first<{ created_at: number; updated_at: number }>()
    expect(stamp!.updated_at, 'the write should have stamped the household').toBeGreaterThan(stamp!.created_at)

    await mint()
    const still = await env.DB.prepare('SELECT id FROM households WHERE id = ?').bind(used.householdId).first()
    expect(still, 'a sandbox someone wrote in must survive the early sweep').not.toBeNull()
  })
})

// The guard that would have caught the 2026-09-16 finding: the pure inventory test can
// only know that a table EXISTS; the live schema knows its columns.
describe('sweep inventory against the live schema', () => {
  it('every inventoried table has the column the sweep scopes it by', async () => {
    const { HOUSEHOLD_TABLES, CHILD_TABLES, scopeColumn } = await import('../functions/_lib/demoHousehold')
    const missing: string[] = []
    for (const t of HOUSEHOLD_TABLES) {
      const col = scopeColumn(t)
      const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?`).bind(t, col).first<{ n: number }>()
      if (!r?.n) missing.push(`${t}.${col}`)
    }
    for (const [t, fk, parent] of CHILD_TABLES) {
      const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?`).bind(t, fk).first<{ n: number }>()
      if (!r?.n) missing.push(`${t}.${fk}`)
      const p = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?`).bind(parent, scopeColumn(parent)).first<{ n: number }>()
      if (!p?.n) missing.push(`${parent}.${scopeColumn(parent)} (parent of ${t})`)
    }
    expect(missing, 'one wrong column rolls back the WHOLE sweep batch — see SCOPE_COLUMN').toEqual([])
  })
})
