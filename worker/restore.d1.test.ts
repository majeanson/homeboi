import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { dump, household } from '../functions/test/d1'
import { runNightly } from '../functions/_lib/nightly'
import { CHILD_TABLES } from '../functions/_lib/demoHousehold'

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

// P0 #2 (review 2026-11-17): the restore is the TARGET household's door. A hand-edited
// dump naming another household's id — on a scoped row, as a child's parent, or as a
// trip it was never on — must land nowhere but the target, and touch nothing else.
describe('a restore writes into the target household only', () => {
  const now = () => Math.floor(Date.now() / 1000)
  const trip = async (owner: string, title: string) => {
    const id = `trip${now()}${Math.random().toString(36).slice(2, 8)}`
    await env.DB.prepare('INSERT INTO shared_trips (id, owner_household_id, title, invite_nonce, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, owner, title, 'n', now()).run()
    return id
  }
  const member = (tripId: string, hh: string, role = 'member') =>
    env.DB.prepare('INSERT INTO shared_trip_members (id, shared_trip_id, household_id, role, joined_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`stm${Math.random().toString(36).slice(2, 12)}`, tripId, hh, role, now(), now()).run()
  const memberships = async (tripId: string) =>
    (await env.DB.prepare('SELECT household_id FROM shared_trip_members WHERE shared_trip_id = ?').bind(tripId).all<{ household_id: string }>()).results.map((r) => r.household_id).sort()

  it('a planted foreign id lands nowhere; the household’s own place on a friend’s trip survives', async () => {
    const victim = await household('restore-victim')
    const friend = await household('restore-friend', undefined, { empty: true })
    const a = await household('restore-attacker')
    const vTrip = await trip(victim.householdId, 'Voyage de la victime')
    await member(vTrip, victim.householdId, 'owner')
    const fTrip = await trip(friend.householdId, 'Voyage d’un ami')
    await member(fTrip, friend.householdId, 'owner')
    await member(fTrip, a.householdId) // the attacker really is on this one
    const victimBefore = strip(await dump(victim.householdId))
    const vTripMembers = await memberships(vTrip)

    const d = await dump(a.householdId)
    const parentOf = CHILD_TABLES.find(([, , parent]) => (victimBefore.tables[parent] ?? []).length > 0)!
    const [childTable, fk, parentTable] = parentOf
    const victimParent = victimBefore.tables[parentTable]![0]!.id as string
    const planted = {
      ...d,
      tables: {
        ...d.tables,
        // A scoped row that names the victim.
        notes: [...(d.tables.notes ?? []), { id: 'plantedNote01', household_id: victim.householdId, text: 'écrit chez la victime', created_at: now() }],
        // A child of the victim's parent (no household column of its own).
        [childTable]: [...(d.tables[childTable] ?? []), { ...((d.tables[childTable] ?? [])[0] ?? victimBefore.tables[childTable]?.[0] ?? {}), id: 'plantedChild1', [fk]: victimParent }],
        // The attacker joins the victim's trip, and enrols the victim on its own.
        shared_trip_members: [
          ...(d.tables.shared_trip_members ?? []),
          { id: 'plantedMemb01', shared_trip_id: vTrip, household_id: a.householdId, role: 'member', joined_at: now(), created_at: now() },
        ],
        shared_trip_notes: [
          ...(d.tables.shared_trip_notes ?? []),
          { id: 'plantedTNote1', shared_trip_id: vTrip, author_household_id: a.householdId, text: 'sur le voyage de la victime', created_at: now() },
        ],
      },
    }
    const res = await a.fetch('/api/takeout/restore', { method: 'POST', body: { password: a.password, source: 'file', takeout: planted } })
    expect(res.status, await res.clone().text()).toBe(200)

    expect(strip(await dump(victim.householdId))).toEqual(victimBefore)
    expect(await memberships(vTrip)).toEqual(vTripMembers)
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM shared_trip_notes WHERE shared_trip_id = ?').bind(vTrip).first<{ n: number }>()).toEqual({ n: 0 })
    // The scoped note was not dropped: it was pulled into the attacker's own household.
    expect(await env.DB.prepare('SELECT household_id FROM notes WHERE id = ?').bind('plantedNote01').first()).toEqual({ household_id: a.householdId })
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${childTable} WHERE ${fk} = ?`).bind(victimParent).first<{ n: number }>()).toEqual({
      n: (victimBefore.tables[childTable] ?? []).filter((r) => r[fk] === victimParent).length,
    })
    // What was legitimately the attacker's — its place on the friend's trip — is back.
    expect(await memberships(fTrip)).toEqual([a.householdId, friend.householdId].sort())
  })
})
