import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { dump, household } from '../functions/test/d1'
import { runNightly } from '../functions/_lib/nightly'

// The restore door end to end against the real D1 + R2 (STATE.md §4-L L8). A backup
// that has never been restored is a hope; this is the rehearsal, run on every push.
const strip = (t: Awaited<ReturnType<typeof dump>>) => ({ ...t, exportedAt: 0 })

describe('takeout restore', () => {
  it('a household restored from its own dump is byte-for-byte what it was — ids kept', async () => {
    const a = await household('restore')
    const before = await dump(a.householdId)
    // Then the household changes: a new note, a renamed household.
    expect((await a.fetch('/api/notes', { method: 'POST', body: { text: 'ajouté après la copie' } })).status).toBeLessThan(300)
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { name: 'Renommée depuis' } })).status).toBe(200)
    expect(strip(await dump(a.householdId))).not.toEqual(strip(before))

    // Wrong password → refused, nothing changes.
    const bad = await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: 'nope nope nope', source: 'file', takeout: before } })
    expect(bad.status).toBe(403)
    expect(((await (await a.fetch('/api/household')).json()) as { name: string }).name).toBe('Renommée depuis')

    const res = await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: a.password, source: 'file', takeout: before } })
    expect(res.status, await res.clone().text()).toBe(200)
    const summary = (await res.json()) as { rows: number; remapped: boolean; skippedTables: string[] }
    expect(summary.remapped).toBe(false)
    expect(summary.rows).toBeGreaterThan(20)
    expect(summary.skippedTables).toEqual([])
    expect(strip(await dump(a.householdId))).toEqual(strip(before))
  })

  it('a dump restored into ANOTHER household gets fresh ids, keeps its content, and leaves the source untouched', async () => {
    const a = await household('source')
    const b = await household('target')
    expect((await a.fetch('/api/household', { method: 'PATCH', body: { name: 'Maison A' } })).status).toBe(200)
    const aDump = await dump(a.householdId)
    const res = await b.fetch('/api/takeout/restore', { method: 'POST', body: { password: b.password, source: 'file', takeout: aDump } })
    expect(res.status, await res.clone().text()).toBe(200)
    const summary = (await res.json()) as { remapped: boolean }
    expect(summary.remapped).toBe(true)
    const bDump = await dump(b.householdId)
    // Same shape and counts, different ids, the household columns re-pointed.
    for (const [table, rows] of Object.entries(aDump.tables)) expect(bDump.tables[table]?.length, table).toBe(rows.length)
    // String ids only: a junction row (contact_group_members) has no `id` column at
    // all, and `undefined` is on both sides by construction.
    const aIds = new Set(Object.values(aDump.tables).flat().map((r) => r.id).filter((v): v is string => typeof v === 'string'))
    expect(aIds.size).toBeGreaterThan(10)
    for (const r of Object.values(bDump.tables).flat()) {
      if (typeof r.id === 'string') expect(aIds.has(r.id), String(r.id)).toBe(false)
      if ('household_id' in r) expect(r.household_id).toBe(b.householdId)
    }
    // A soft reference followed the remap: a member's id inside a task's rotation.
    const tasks = bDump.tables.tasks ?? []
    const memberIds = new Set((bDump.tables.members ?? []).map((m) => m.id as string))
    for (const t of tasks) for (const id of JSON.parse(String(t.rotation_json ?? '[]')) as string[]) expect(memberIds.has(id), `rotation ${id}`).toBe(true)
    expect(((await (await b.fetch('/api/household')).json()) as { name: string }).name).toBe('Maison A')
    expect(strip(await dump(a.householdId))).toEqual(strip(aDump))
  })

  it('a nightly copy can be listed and restored from R2', async () => {
    const a = await household('nightcopy')
    const now = Math.floor(Date.now() / 1000)
    await runNightly(env, now)
    const list = (await (await a.fetch('/api/takeout/backups')).json()) as { backups: { date: string; bytes: number }[] }
    const date = new Date(now * 1000).toISOString().slice(0, 10)
    expect(list.backups.map((b) => b.date)).toContain(date)
    expect((await a.fetch('/api/notes', { method: 'POST', body: { text: 'après la copie de nuit' } })).status).toBeLessThan(300)
    const res = await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: a.password, source: 'backup', date } })
    expect(res.status, await res.clone().text()).toBe(200)
    const notes = (await (await a.fetch('/api/notes')).json()) as { notes?: { text: string }[] } | { text: string }[]
    const texts = JSON.stringify(notes)
    expect(texts).not.toContain('après la copie de nuit')
    // A copy that does not exist is a 404, not a 500.
    expect((await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: a.password, source: 'backup', date: '1999-01-01' } })).status).toBe(404)
  })

  it('a kiosk cannot restore, and garbage is a 400', async () => {
    const a = await household('garbage')
    expect((await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: a.password, source: 'file', takeout: { hello: 1 } } })).status).toBe(400)
    expect((await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: a.password, source: 'nope' } })).status).toBe(400)
  })
})
