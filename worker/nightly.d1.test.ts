import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'
import { runNightly } from '../functions/_lib/nightly'
import { DEMO_SANDBOX_TTL } from '../functions/_lib/demoHousehold'

// The nightly cron end to end against the real D1 + R2 (STATE.md §4-L L7): a backup
// lands in the bucket for a real household, an aged sandbox is swept, and the report
// says so — with zero stale survivors, which is the number the alert keys on.
describe('nightly', () => {
  it('backs a household up to R2, sweeps an aged sandbox, and reports no survivors', async () => {
    const a = await household('night')
    // An aged sandbox.
    const res = await anon('/api/demo', { method: 'POST', headers: { 'CF-Connecting-IP': '10.7.7.7' } })
    const set = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c: string) => c.split(';')[0])
    const me = (await (await anon('/api/auth/me', { headers: { Cookie: set.join('; ') } })).json()) as { household?: { id: string } }
    const sandboxId = me.household!.id
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare('UPDATE households SET created_at = ? WHERE id = ?').bind(now - DEMO_SANDBOX_TTL - 3600, sandboxId).run()

    const report = await runNightly(env, now)
    expect(report.failed, JSON.stringify(report)).toEqual([])
    expect(report.noBucket).toBe(false)
    expect(report.sandboxesSwept).toBeGreaterThanOrEqual(1)
    expect(report.sandboxesStale).toBe(0)
    expect(report.backed).toBe(report.households)
    expect(report.households).toBeGreaterThanOrEqual(1)

    // The backup is really in the bucket, and really is the takeout dump.
    const date = new Date(now * 1000).toISOString().slice(0, 10)
    const obj = await env.PHOTOS!.get(`backup/${a.householdId}/${date}.json`)
    expect(obj).not.toBeNull()
    const dump = (await obj!.json()) as { householdId: string; tables: Record<string, unknown[]> }
    expect(dump.householdId).toBe(a.householdId)
    expect(Object.keys(dump.tables).length).toBeGreaterThan(20)
    // …and the swept sandbox got no backup (it was gone before the loop).
    expect(await env.PHOTOS!.get(`backup/${sandboxId}/${date}.json`)).toBeNull()
  })
})
