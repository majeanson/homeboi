import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'

// POST /api/household/reset — « Repartir à neuf » (2026-09-23), through the real Worker
// against a real D1 and a real R2. The little sibling of leave.d1.test.ts, and tested the
// same way: every way in that must NOT open, and the blast radius when it does. It adds
// the half leaving does not have — what must SURVIVE: the account, the session, the
// paired tablet, the settings. A reset that erased the family and ALSO signed everyone
// out and unpaired the wall would be a delete with extra steps.

const reset = (s: Awaited<ReturnType<typeof household>>, body: Record<string, unknown>) =>
  s.fetch('/api/household/reset', { method: 'POST', body })

const n = async (sql: string, ...binds: unknown[]) =>
  ((await env.DB.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0) as number

describe('repartir à neuf', () => {
  it('refuses no password, a wrong password, and a right password with the wrong name — and keeps everything', async () => {
    const a = await household('reset-locks')
    const before = await n('SELECT COUNT(*) AS n FROM members WHERE household_id = ?', a.householdId)
    expect(before).toBeGreaterThan(0)

    expect((await reset(a, { name: 'Maisonnée reset-locks' })).status).toBe(400)
    expect((await reset(a, { password: 'not it', name: 'Maisonnée reset-locks' })).status).toBe(403)
    expect((await reset(a, { password: a.password, name: 'une autre maisonnée' })).status).toBe(400)
    // No body at all: the isolation sweep walks every route body-less and asserts no 500.
    expect((await a.fetch('/api/household/reset', { method: 'POST' })).status).toBe(400)

    expect(await n('SELECT COUNT(*) AS n FROM members WHERE household_id = ?', a.householdId)).toBe(before)
  })

  it('accepts the name with different case and accents', async () => {
    const a = await household('reset-fold')
    expect((await reset(a, { password: a.password, name: '  maisonnee RESET-FOLD  ' })).status).toBe(200)
    expect(await n('SELECT COUNT(*) AS n FROM members WHERE household_id = ?', a.householdId)).toBe(0)
  })

  it('takes the content and the blobs, keeps the account, the tablet and the settings — and leaves the neighbour alone', async () => {
    const a = await household('reset-go')
    const b = await household('reset-stays')

    // Something of the family's own, beside the examples.
    expect((await a.fetch('/api/list', { method: 'POST', body: { text: 'nos vraies pommes' } })).status).toBe(200)
    expect((await b.fetch('/api/list', { method: 'POST', body: { text: 'du lait' } })).status).toBe(200)
    // A photo, with its blob in R2.
    const key = `ph_reset_${Date.now()}`
    // R2 is optional in production (env.ts) but bound in this harness (wrangler.toml).
    const bucket = env.PHOTOS!
    await bucket.put(key, new Uint8Array([1, 2, 3]))
    await env.DB.prepare('INSERT INTO photos (id, household_id, media_key, created_at) VALUES (?, ?, ?, ?)')
      .bind(`ph${Date.now()}`.slice(0, 12), a.householdId, key, Math.floor(Date.now() / 1000))
      .run()
    // A setting, and a paired device.
    await env.DB.prepare("INSERT INTO household_preferences (household_id, key, value, updated_at) VALUES (?, 'reset-test', '{\"kept\":true}', 1)")
      .bind(a.householdId)
      .run()
    const mint = await a.fetch('/api/pair/devices', { method: 'POST', body: { mintAgent: true, label: 'Tablette' } })
    expect(mint.status).toBe(200)
    const devicesBefore = await n('SELECT COUNT(*) AS n FROM devices WHERE household_id = ?', a.householdId)
    expect(devicesBefore).toBeGreaterThan(0)

    expect((await reset(a, { password: a.password, name: 'Maisonnée reset-go' })).status).toBe(200)

    // The content is gone — examples AND the family's own rows — and the blob with it.
    for (const table of ['members', 'recipes', 'events', 'tasks', 'routines', 'notes', 'list_items', 'photos']) {
      expect(await n(`SELECT COUNT(*) AS n FROM ${table} WHERE household_id = ?`, a.householdId), table).toBe(0)
    }
    expect(await bucket.get(key),'a reset frees R2 — nothing will point at that blob again').toBeNull()

    // Who may open it stays: the household, the account, THIS session, the tablet.
    expect(await n('SELECT COUNT(*) AS n FROM households WHERE id = ?', a.householdId)).toBe(1)
    expect(await n('SELECT COUNT(*) AS n FROM operators WHERE household_id = ?', a.householdId)).toBe(1)
    expect((await a.fetch('/api/list')).status, 'the session survives a start-over').toBe(200)
    expect(await n('SELECT COUNT(*) AS n FROM devices WHERE household_id = ?', a.householdId)).toBe(devicesBefore)
    // …and the settings: the name, and the preference row.
    const hh = (await (await a.fetch('/api/household')).json()) as { name?: string }
    expect(hh.name).toBe('Maisonnée reset-go')
    expect(await n("SELECT COUNT(*) AS n FROM household_preferences WHERE household_id = ? AND key = 'reset-test'", a.householdId)).toBe(1)

    // AND THE NEIGHBOUR IS UNTOUCHED.
    expect(await n('SELECT COUNT(*) AS n FROM members WHERE household_id = ?', b.householdId)).toBeGreaterThan(0)
    expect(await n("SELECT COUNT(*) AS n FROM list_items WHERE household_id = ? AND text = 'du lait'", b.householdId)).toBe(1)
  })

  it('cannot be done by a device token', async () => {
    const a = await household('reset-device')
    // Same honesty as leave.d1.test.ts: an `agent` is refused every non-GET centrally by
    // route.ts, so this pins the read-only gate; `authed(…, 'operator')` is the second lock.
    const mint = await a.fetch('/api/pair/devices', { method: 'POST', body: { mintAgent: true, label: 'Tablette' } })
    const { token } = (await mint.json()) as { token: string }
    const res = await anon('/api/household/reset', {
      method: 'POST',
      body: { password: a.password, name: 'Maisonnée reset-device' },
      headers: { 'X-Device-Token': token },
    })
    expect(res.status).toBe(403)
    expect(await n('SELECT COUNT(*) AS n FROM members WHERE household_id = ?', a.householdId)).toBeGreaterThan(0)
  })
})
