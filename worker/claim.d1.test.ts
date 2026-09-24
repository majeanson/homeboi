import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'
import { isSandboxEmail } from '../functions/_lib/demoHousehold'

// « Garder ma maisonnée » (demo/claim.ts), against a real D1. Claiming is a signup in
// disguise, and until 2026-09-23 nothing here exercised it: the claimed account stayed
// permanently UNVERIFIED (the sandbox operator is born with verified_at NULL and the
// claim never touched it), which would have silently cost it the two doors migration
// 0138 gates the day mail was wired. The first case below is the one that was red.
//
// Not covered here: the invite-gate branch. LOGIN_PASSWORD is unset in the harness and
// env is fixed per run, so it is held as a pure table instead — _lib/signupGate.test.ts,
// the one module signup and the claim both ask.
describe('demo claim', () => {
  async function mint(): Promise<{ householdId: string; cookie: string; csrf: string; claim: (body: unknown) => Promise<Response> }> {
    const res = await anon('/api/demo', { method: 'POST', headers: { 'CF-Connecting-IP': `10.1.0.${Math.floor(Math.random() * 250)}` } })
    expect(res.status).toBe(200)
    const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c: string) => c.split(';')[0])
    const cookie = set.join('; ')
    const csrf = (cookie.match(/bb_csrf=([^;]+)/) ?? [])[1] ?? ''
    const me = (await (await anon('/api/auth/me', { headers: { Cookie: cookie } })).json()) as { household?: { id: string } }
    return {
      householdId: me.household!.id,
      cookie,
      csrf,
      claim: (body) => anon('/api/demo/claim', { method: 'POST', body, headers: { Cookie: cookie, 'X-CSRF-Token': csrf } }),
    }
  }

  const fresh = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@d1.test`

  it('stamps the claimed address verified when this deployment cannot send mail — like signup', async () => {
    const s = await mint()
    const email = fresh('claim-verify')
    expect((await s.claim({ email, password: 'correct horse battery' })).status).toBe(200)
    const row = await env.DB.prepare('SELECT verified_at FROM operators WHERE email = ?').bind(email).first<{ verified_at: number | null }>()
    expect(row?.verified_at, 'a claimed account must not be locked out of the 0138-gated doors forever').not.toBeNull()
  })

  it('keeps the household and everything in it, under a new session, out of the sandbox count', async () => {
    const s = await mint()
    const wrote = await anon('/api/list', { method: 'POST', body: { text: 'des œufs' }, headers: { Cookie: s.cookie, 'X-CSRF-Token': s.csrf } })
    expect(wrote.status).toBe(200)

    const email = fresh('claim-keep')
    const res = await s.claim({ email, password: 'correct horse battery', householdName: 'Chez nous' })
    expect(res.status).toBe(200)

    // The re-issued cookie is the one that works now.
    const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c: string) => c.split(';')[0])
    const me = (await (await anon('/api/auth/me', { headers: { Cookie: set.join('; ') } })).json()) as { signedIn: boolean; household?: { id: string } }
    expect(me.signedIn).toBe(true)
    expect(me.household?.id, 'the household id never changes').toBe(s.householdId)

    const hh = await env.DB.prepare('SELECT name FROM households WHERE id = ?').bind(s.householdId).first<{ name: string }>()
    expect(hh?.name).toBe('Chez nous')
    const item = await env.DB.prepare("SELECT COUNT(*) AS n FROM list_items WHERE household_id = ? AND text = 'des œufs'").bind(s.householdId).first<{ n: number }>()
    expect(item?.n, 'what the visitor tried survives').toBe(1)
    // Out of the sweep and the cap: both key on the sandbox address (SANDBOX_EMAIL_LIKE),
    // so ask THIS household's operator directly — a global count would race any other
    // file minting a sandbox at the same moment.
    const op = await env.DB.prepare('SELECT email FROM operators WHERE household_id = ?').bind(s.householdId).first<{ email: string }>()
    expect(op?.email).toBe(email)
    expect(isSandboxEmail(op!.email), 'a claimed household leaves the sweep and frees its slot').toBe(false)
  })

  it('409s an address that already has an account', async () => {
    const taken = await household('claim-taken')
    const s = await mint()
    expect((await s.claim({ email: taken.email, password: 'correct horse battery' })).status).toBe(409)
  })

  it('400s an address still inside the sandbox namespace', async () => {
    const s = await mint()
    expect((await s.claim({ email: 'demo-nope@babillard.invalid', password: 'correct horse battery' })).status).toBe(400)
  })

  it('403s a real account — it has nothing to convert', async () => {
    const real = await household('claim-real')
    expect((await real.fetch('/api/demo/claim', { method: 'POST', body: { email: fresh('x'), password: 'correct horse battery' } })).status).toBe(403)
  })

  it('401s when the sweep took the sandbox first', async () => {
    const s = await mint()
    // The sweep's kill switch is the operators row; drop it the way the sweep would.
    await env.DB.prepare("DELETE FROM operators WHERE household_id = ? AND email LIKE 'demo-%'").bind(s.householdId).run()
    expect((await s.claim({ email: fresh('claim-swept'), password: 'correct horse battery' })).status).toBe(401)
  })
})
