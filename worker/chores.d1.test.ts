import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { localDayStart } from '../functions/_lib/ids'

// LES CORVÉES against a real D1: a rotation, a turn that advances only when the thing is
// finished, a helper who pitches in without finishing it, and the ledger that shows who
// did what without ever scoring it.

interface Chore {
  id: string
  title: string
  rotation_json: string
  current_idx: number
  last_done_at: number | null
  last_done_by: string | null
  color: string
  recur_json: string | null
  recur_start: number | null
  lead_seconds: number | null
  announce_evening: number | null
}
interface Ledger {
  since: number
  ledger: { date: number; choreId: string; choreTitle: string; helpers: { memberId: string | null; name: string | null; role: string }[] }[]
}

const chores = async (s: Session) => (await okJson<{ chores: Chore[] }>(s.fetch('/api/chores'))).chores
const one = async (s: Session, id: string) => (await chores(s)).find((c) => c.id === id)
const add = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Vaisselle', ...body } }))).id
const patch = (s: Session, body: Record<string, unknown>) => okJson<{ complete?: boolean; nextIdx?: number }>(s.fetch('/api/chores', { method: 'PATCH', body }))
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const ledger = (s: Session) => okJson<Ledger>(s.fetch('/api/chores-ledger'))

describe('une corvée', () => {
  it('is created, edited in place, and deleted with its contribution log', async () => {
    const s = await household('chores-crud', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const id = await add(s, { title: '  Bac bleu  ', rotation: [a], color: '#123456', recur: { freq: 'weekly', weekdays: [4] }, start: 1700000000, leadSeconds: 30 * 86400, announceEvening: true })
    expect(await one(s, id)).toMatchObject({ title: 'Bac bleu', color: '#123456', current_idx: 0, recur_start: localDayStart(new Date(1700000000 * 1000)), lead_seconds: 7 * 86400, announce_evening: 1 })
    expect(JSON.parse((await one(s, id))!.rotation_json)).toEqual([a])

    await patch(s, { id, title: 'Bac vert', color: 'pas-une-couleur', announceEvening: false, recur: null })
    expect(await one(s, id), 'each edit is one write; an unset flag is NULL, never a bare 0').toMatchObject({ title: 'Bac vert', color: '#88a36f', announce_evening: null, recur_json: null, current_idx: 0 })

    await patch(s, { id })
    expect((await ledger(s)).ledger, 'a done chore is on the record').toHaveLength(1)
    await okJson(s.fetch('/api/chores', { method: 'DELETE', body: { id } }))
    expect(await chores(s)).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM task_participants WHERE task_id = ?').bind(id).first(), 'the FK would refuse it otherwise').toBeNull()
  })

  it('refuses no title; a stranger’s chore is a 404 for both an edit and a tick', async () => {
    const s = await household('chores-a', undefined, { empty: true })
    const other = await household('chores-b', undefined, { empty: true })
    expect((await s.fetch('/api/chores', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
    const id = await add(s, {})
    expect((await other.fetch('/api/chores', { method: 'PATCH', body: { id, title: 'Volée' } })).status).toBe(404)
    expect((await other.fetch('/api/chores', { method: 'PATCH', body: { id } })).status).toBe(404)
    expect(await one(s, id)).toMatchObject({ title: 'Vaisselle', last_done_at: null })
  })
})

describe('le tour', () => {
  it('finishing advances the rotation, wraps, and stamps whose turn it was', async () => {
    const s = await household('chores-turn', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const b = await member(s, 'Marc')
    const id = await add(s, { rotation: [a, b] })

    expect(await patch(s, { id })).toMatchObject({ complete: true, nextIdx: 1 })
    expect(await one(s, id)).toMatchObject({ current_idx: 1, last_done_by: a })
    expect((await one(s, id))!.last_done_at).toBeGreaterThan(0)

    expect((await patch(s, { id })).nextIdx, 'back to the first').toBe(0)
    expect(await one(s, id)).toMatchObject({ current_idx: 0, last_done_by: b })
  })

  it('a helper pitching in is logged but does not finish it or take the turn', async () => {
    const s = await household('chores-help', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const kid = await member(s, 'Zoé')
    const id = await add(s, { rotation: [a] })

    expect((await patch(s, { id, complete: false, role: 'child', memberId: kid })).complete).toBe(false)
    expect(await one(s, id), 'not finished').toMatchObject({ current_idx: 0, last_done_at: null })
    expect((await ledger(s)).ledger[0]?.helpers).toEqual([expect.objectContaining({ memberId: kid, name: 'Zoé', role: 'child' })])
  })

  it('a shorter rotation cannot strand the turn out of range', async () => {
    const s = await household('chores-short', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const b = await member(s, 'Marc')
    const c = await member(s, 'Zoé')
    const id = await add(s, { rotation: [a, b, c] })
    await patch(s, { id })
    await patch(s, { id })
    expect((await one(s, id))!.current_idx).toBe(2)

    await patch(s, { id, rotation: [a, b, 7] })
    expect(JSON.parse((await one(s, id))!.rotation_json), 'only strings stay').toEqual([a, b])
    expect((await patch(s, { id })).nextIdx).toBe(1)
    expect((await one(s, id))!.last_done_by, 'index 2 of two people is the first').toBe(a)
  })

  it('a chore nobody is assigned to can still be done', async () => {
    const s = await household('chores-norota', undefined, { empty: true })
    const id = await add(s, {})
    expect(await patch(s, { id })).toMatchObject({ nextIdx: 0 })
    expect(await one(s, id)).toMatchObject({ current_idx: 0, last_done_by: null })
    expect((await ledger(s)).ledger[0]!.helpers, 'an anonymous tap is a role, not a name').toEqual([expect.objectContaining({ name: null, role: 'parent' })])
  })
})

describe('le registre', () => {
  it('collapses repeat taps to one face per chore per day and never ships a count', async () => {
    const s = await household('ledger-calm', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const b = await member(s, 'Marc')
    const id = await add(s, { rotation: [a] })
    for (let i = 0; i < 3; i++) await patch(s, { id, memberId: a })
    await patch(s, { id, memberId: b })

    const { ledger: rows } = await ledger(s)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.helpers.map((h) => h.name).sort(), 'each person once').toEqual(['Léa', 'Marc'])
    expect(JSON.stringify(rows), 'names and dates, no tally').not.toMatch(/"(count|total|rank|score)"/)
  })

  it('a member who left stays an anonymous record, and an old contribution falls outside the default window', async () => {
    const s = await household('ledger-left', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const id = await add(s, { rotation: [a] })
    await patch(s, { id })
    await okJson(s.fetch('/api/members', { method: 'DELETE', body: { id: a } }))
    expect((await ledger(s)).ledger[0]!.helpers[0], 'the chore keeps the fact, not the face').toMatchObject({ memberId: null, name: null })

    const old = Math.floor(Date.now() / 1000) - 40 * 86400
    await env.DB.prepare('UPDATE task_participants SET contributed_at = ? WHERE task_id = ?').bind(old, id).run()
    expect((await ledger(s)).ledger).toEqual([])
    const year = await okJson<Ledger>(s.fetch(`/api/chores-ledger?since=${old - 1}`))
    expect(year.ledger, '?since reaches back for the house diary').toHaveLength(1)
  })

  it('another household’s work is not on my ledger', async () => {
    const s = await household('ledger-a', undefined, { empty: true })
    const other = await household('ledger-b', undefined, { empty: true })
    await patch(other, { id: await add(other, {}) })
    expect((await ledger(s)).ledger).toEqual([])
  })
})
