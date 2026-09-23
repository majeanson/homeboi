import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'

// /api/seed — the examples door, against a real D1. Since 2026-09-23 it is the ONLY way
// a real household gets the Tremblay family (signup starts empty; the full demo lives in
// the sandbox), so « Charger » and « Vider » are no longer a settings nicety — they are
// the whole examples story for an account. Nothing exercised this endpoint at runtime
// before; the pure tests stub D1.
describe('les exemples', () => {
  const count = async (s: Awaited<ReturnType<typeof household>>) =>
    ((await (await s.fetch('/api/seed')).json()) as { count: number }).count

  it('loads on demand, and a second load is a no-op rather than a second family', async () => {
    const a = await household('seed-load', undefined, { empty: true })
    expect(await count(a)).toBe(0)

    const first = (await (await a.fetch('/api/seed', { method: 'POST' })).json()) as { seeded: number; count: number }
    expect(first.seeded).toBeGreaterThan(0)
    expect(first.count).toBeGreaterThan(0)

    const again = (await (await a.fetch('/api/seed', { method: 'POST' })).json()) as { seeded: number; count: number }
    expect(again.seeded, 'a double tap must not seed the Tremblays twice').toBe(0)
    expect(again.count).toBe(first.count)
  })

  it('« Vider » takes only the examples — never a row the family wrote while exploring', async () => {
    const a = await household('seed-clear')
    expect(await count(a)).toBeGreaterThan(0)
    expect((await a.fetch('/api/list', { method: 'POST', body: { text: 'nos vraies pommes' } })).status).toBe(200)

    expect((await a.fetch('/api/seed', { method: 'DELETE' })).status).toBe(200)
    expect(await count(a)).toBe(0)
    const samples = await env.DB.prepare('SELECT COUNT(*) AS n FROM list_items WHERE household_id = ? AND is_sample = 1')
      .bind(a.householdId)
      .first<{ n: number }>()
    expect(samples?.n ?? 0).toBe(0)
    const ours = await env.DB.prepare("SELECT COUNT(*) AS n FROM list_items WHERE household_id = ? AND text = 'nos vraies pommes'")
      .bind(a.householdId)
      .first<{ n: number }>()
    expect(ours?.n, 'what the family added survives the clear').toBe(1)
  })

  it('a device can read the count but can neither load nor clear', async () => {
    const a = await household('seed-device', undefined, { empty: true })
    const mint = await a.fetch('/api/pair/devices', { method: 'POST', body: { mintAgent: true, label: 'Tablette' } })
    const { token } = (await mint.json()) as { token: string }
    const headers = { 'X-Device-Token': token }
    expect((await anon('/api/seed', { headers })).status).toBe(200)
    expect((await anon('/api/seed', { method: 'POST', headers })).status).toBe(403)
    expect((await anon('/api/seed', { method: 'DELETE', headers })).status).toBe(403)
    expect(await count(a)).toBe(0)
  })
})
