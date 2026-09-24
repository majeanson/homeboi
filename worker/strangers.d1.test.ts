import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'
import { doorCounts, recentStrangerRemarks } from '../functions/_lib/strangers'
import { nowSec } from '../functions/_lib/ids'
import type { Env } from '../functions/_lib/env'

// What the operator sees of OTHER households (_lib/strangers.ts), against a real D1: the
// SQL is the whole feature, and each clause below is a line someone could get subtly
// wrong — whose remarks are « mine », what counts as a real household, what « wrote
// something » means. The d1 suite shares one database, so the door is asserted as
// DELTAS around what each case does, never as absolute numbers.

const DAY = 86_400
const file = (s: Awaited<ReturnType<typeof household>>, title: string) =>
  s.fetch('/api/remarks', { method: 'POST', body: { kind: 'bug', title } })

describe('les remarques d’ailleurs', () => {
  it('brings other households’ recent remarks, skips the operator’s own, the old and the deleted', async () => {
    const mine = await household('str-mine', undefined, { empty: true })
    const theirs = await household('str-theirs', undefined, { empty: true })
    const visitor = await household('str-visitor', undefined, { empty: true })

    expect((await file(mine, 'Ma propre remarque')).status).toBe(200)
    expect((await file(theirs, 'Leur remarque récente')).status).toBe(200)
    expect((await file(theirs, 'Leur vieille remarque')).status).toBe(200)
    expect((await file(theirs, 'Leur remarque effacée')).status).toBe(200)
    // Filed while signed in, THEN the household becomes a sandbox (changing the operator
    // email first would sign the session out). The row belongs to the household, and the
    // household's operator is what makes it a sandbox's remark.
    expect((await file(visitor, 'Remarque de démo')).status).toBe(200)
    await env.DB.prepare('UPDATE operators SET email = ? WHERE household_id = ?')
      .bind(`demo-${visitor.householdId.toLowerCase()}@babillard.invalid`, visitor.householdId)
      .run()
    await env.DB.prepare(`UPDATE remarks SET created_at = ? WHERE title = 'Leur vieille remarque'`).bind(nowSec() - 2 * DAY).run()
    await env.DB.prepare(`UPDATE remarks SET deleted_at = ? WHERE title = 'Leur remarque effacée'`).bind(nowSec()).run()

    // The operator is whoever ALERT_EMAIL names — here, `mine`.
    const asOperator = { ...env, ALERT_EMAIL: `  ${mine.email.toUpperCase()} ` } as Env
    const got = await recentStrangerRemarks(asOperator, nowSec(), 500)
    const titles = got.map((r) => r.title)
    expect(titles).toContain('Leur remarque récente')
    expect(titles).toContain('Remarque de démo')
    // Red against dropping the own-household clause (Marc reads his through the MCP tool).
    expect(titles).not.toContain('Ma propre remarque')
    expect(titles).not.toContain('Leur vieille remarque')
    expect(titles).not.toContain('Leur remarque effacée')
    expect(got.find((r) => r.title === 'Remarque de démo')?.sandbox).toBe(true)
    expect(got.find((r) => r.title === 'Leur remarque récente')).toMatchObject({ sandbox: false, householdId: theirs.householdId })
  })
})

describe('la porte, en chiffres', () => {
  it('counts real new households, confirmed ones, the active and the stuck — never a sandbox', async () => {
    const t0 = await doorCounts(env, nowSec())

    // A confirmed new household (the harness has no mail, so signup stamps it verified)
    // that writes something: new, confirmed, active.
    const writer = await household('door-writer', undefined, { empty: true })
    expect((await writer.fetch('/api/list', { method: 'POST', body: { text: 'des œufs' } })).status).toBe(200)

    // An unconfirmed one that never wrote a thing, five days old: new, NOT confirmed, not
    // active — and stuck at the welcome card (no member after 3 days).
    const stuck = await household('door-stuck', undefined, { empty: true })
    await env.DB.prepare('UPDATE operators SET verified_at = NULL WHERE household_id = ?').bind(stuck.householdId).run()
    await env.DB.prepare('UPDATE households SET created_at = ? WHERE id = ?').bind(nowSec() - 5 * DAY, stuck.householdId).run()

    // A sandbox that writes: none of the four numbers may move.
    const sandbox = await household('door-sandbox', undefined, { empty: true })
    expect((await sandbox.fetch('/api/list', { method: 'POST', body: { text: 'du lait' } })).status).toBe(200)
    await env.DB.prepare('UPDATE operators SET email = ? WHERE household_id = ?')
      .bind(`demo-${sandbox.householdId.toLowerCase()}@babillard.invalid`, sandbox.householdId)
      .run()

    const t1 = await doorCounts(env, nowSec())
    expect(t1.newHouseholds - t0.newHouseholds).toBe(2)
    expect(t1.newConfirmed - t0.newConfirmed).toBe(1)
    expect(t1.active - t0.active).toBe(1)
    expect(t1.stuckEmpty - t0.stuckEmpty).toBe(1)

    // A member arrives: the stuck household is not stuck any more.
    const m = await stuck.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } })
    expect(m.status).toBeLessThan(300)
    const t2 = await doorCounts(env, nowSec())
    expect(t2.stuckEmpty - t0.stuckEmpty).toBe(0)
    expect(t2.active - t0.active).toBe(2)
  })
})
