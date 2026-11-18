import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { localDayStart } from '../functions/_lib/ids'
import { taskDay } from '../functions/_lib/taskDay'

// « CHACUN SON TOUR » against a real D1, through the one task door (/api/tasks): a rotation,
// a turn that advances only when the thing is done, and the ledger that shows who did what
// without ever scoring it. These cases lived on /api/chores, the alias deleted in review #37
// (its « a helper pitches in without finishing » gesture went with it: no client door sent it).

interface Row {
  id: string
  title: string
  rotation_json: string
  current_idx: number
  last_done_at: number | null
  last_done_by: string | null
  color: string | null
  recur_json: string | null
  recur_start: number | null
  lead_seconds: number | null
  announce_evening: number | null
}
interface Ledger {
  since: number
  ledger: { date: number; choreId: string; choreTitle: string; helpers: { memberId: string | null; name: string | null; role: string }[] }[]
}

const one = async (s: Session, id: string): Promise<Row | undefined> => {
  const r = await env.DB.prepare(
    'SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by, colour AS color, recur_json, at AS recur_start, lead_seconds, announce_evening FROM home_projects WHERE id = ? AND household_id = ?',
  )
    .bind(id, s.householdId)
    .first<Row>()
  return r ? { ...r, recur_start: taskDay(r.recur_start) } : undefined
}
const add = async (s: Session, body: Record<string, unknown>) =>
  (await okJson<{ id: string }>(s.fetch('/api/tasks', { method: 'POST', body: { title: 'Vaisselle', ...body } }))).id
const tick = (s: Session, id: string, extra: Record<string, unknown> = {}) =>
  okJson<{ complete?: boolean; nextIdx?: number }>(s.fetch('/api/tasks', { method: 'PATCH', body: { id, done: true, ...extra } }))
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const ledger = (s: Session) => okJson<Ledger>(s.fetch('/api/chores-ledger'))

describe('une tâche à tour de rôle', () => {
  it('is created, edited from the one form, and deleted with its contribution log', async () => {
    const s = await household('turns-crud', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const weekly = { freq: 'weekly', weekdays: [4] }
    const id = await add(s, { title: '  Bac bleu  ', rotation: [a], color: '#123456', recur: weekly, at: 1700000000, leadSeconds: 30 * 86400, announceEvening: true })
    expect(await one(s, id)).toMatchObject({
      title: 'Bac bleu',
      color: '#123456',
      current_idx: 0,
      recur_start: localDayStart(new Date(1700000000 * 1000)),
      lead_seconds: 7 * 86400,
      announce_evening: 1,
    })
    expect(JSON.parse((await one(s, id))!.rotation_json)).toEqual([a])

    // The form sends every layer: what it leaves out is unset, never a bare 0.
    await okJson(s.fetch('/api/tasks', { method: 'PATCH', body: { id, title: 'Bac vert', rotation: [a], recur: weekly } }))
    expect(await one(s, id)).toMatchObject({ title: 'Bac vert', color: null, announce_evening: null, current_idx: 0 })

    await tick(s, id)
    expect((await ledger(s)).ledger, 'a done task is on the record').toHaveLength(1)
    await okJson(s.fetch('/api/tasks', { method: 'DELETE', body: { id } }))
    expect(await one(s, id)).toBeUndefined()
    expect(await env.DB.prepare('SELECT 1 FROM task_participants WHERE task_id = ?').bind(id).first(), 'the FK would refuse it otherwise').toBeNull()
  })

  it('the one form opens on its row, with its schedule: /api/tasks/one', async () => {
    const s = await household('turns-one', undefined, { empty: true })
    const other = await household('turns-one-b', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const id = await add(s, { rotation: [a], recur: { freq: 'weekly', weekdays: [2] }, at: 1700000000, leadSeconds: 86400 })
    const one1 = (sess: Session, x: string) => okJson<{ task: Row | null }>(sess.fetch(`/api/tasks/one?id=${x}`))
    expect((await one1(s, id)).task).toMatchObject({ id, title: 'Vaisselle', recur_start: localDayStart(new Date(1700000000 * 1000)), lead_seconds: 86400 })
    expect(JSON.parse((await one1(s, id)).task!.rotation_json)).toEqual([a])
    expect((await one1(other, id)).task, 'another household reads nothing').toBeNull()
    const home = (await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Toit', kind: 'upkeep' } }))).id
    expect((await one1(s, home)).task, 'a home row is not a task').toBeNull()
    expect((await s.fetch('/api/tasks/one')).status).toBe(400)
  })

  it('refuses no title; a stranger’s task is a 404 for both an edit and a tick', async () => {
    const s = await household('turns-a', undefined, { empty: true })
    const other = await household('turns-b', undefined, { empty: true })
    expect((await s.fetch('/api/tasks', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
    const id = await add(s, {})
    expect((await other.fetch('/api/tasks', { method: 'PATCH', body: { id, title: 'Volée' } })).status).toBe(404)
    expect((await other.fetch('/api/tasks', { method: 'PATCH', body: { id, done: true } })).status).toBe(404)
    expect(await one(s, id)).toMatchObject({ title: 'Vaisselle', last_done_at: null })
  })
})

describe('le tour', () => {
  it('finishing advances the rotation, wraps, and stamps whose turn it was', async () => {
    const s = await household('turns-turn', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const b = await member(s, 'Marc')
    const id = await add(s, { rotation: [a, b] })

    expect(await tick(s, id)).toMatchObject({ complete: true, nextIdx: 1 })
    expect(await one(s, id)).toMatchObject({ current_idx: 1, last_done_by: a })
    expect((await one(s, id))!.last_done_at).toBeGreaterThan(0)

    expect((await tick(s, id)).nextIdx, 'back to the first').toBe(0)
    expect(await one(s, id)).toMatchObject({ current_idx: 0, last_done_by: b })
  })

  it('a shorter rotation cannot strand the turn out of range', async () => {
    const s = await household('turns-short', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const b = await member(s, 'Marc')
    const c = await member(s, 'Zoé')
    const id = await add(s, { rotation: [a, b, c] })
    await tick(s, id)
    await tick(s, id)
    expect((await one(s, id))!.current_idx).toBe(2)

    await okJson(s.fetch('/api/tasks', { method: 'PATCH', body: { id, title: 'Vaisselle', rotation: [a, b, 7] } }))
    expect(JSON.parse((await one(s, id))!.rotation_json), 'only strings stay').toEqual([a, b])
    expect((await tick(s, id)).nextIdx).toBe(1)
    expect((await one(s, id))!.last_done_by, 'index 2 of two people is the first').toBe(a)
  })

  it('a task nobody is assigned to can still be done', async () => {
    const s = await household('turns-norota', undefined, { empty: true })
    const id = await add(s, {})
    expect(await tick(s, id)).toMatchObject({ nextIdx: 0 })
    expect(await one(s, id)).toMatchObject({ current_idx: 0, last_done_by: null })
    expect((await ledger(s)).ledger[0]!.helpers, 'an anonymous tap is a role, not a name').toEqual([expect.objectContaining({ name: null, role: 'parent' })])
  })
})

describe('le registre', () => {
  it('collapses repeat taps to one face per task per day and never ships a count', async () => {
    const s = await household('turns-ledger', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const b = await member(s, 'Marc')
    const id = await add(s, { rotation: [a] })
    for (let i = 0; i < 3; i++) await tick(s, id, { memberId: a })
    await tick(s, id, { memberId: b })

    const { ledger: rows } = await ledger(s)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.helpers.map((h) => h.name).sort(), 'each person once').toEqual(['Léa', 'Marc'])
    expect(JSON.stringify(rows), 'names and dates, no tally').not.toMatch(/"(count|total|rank|score)"/)
  })

  it('a member who left stays an anonymous record, and an old contribution falls outside the default window', async () => {
    const s = await household('turns-left', undefined, { empty: true })
    const a = await member(s, 'Léa')
    const id = await add(s, { rotation: [a] })
    await tick(s, id)
    await okJson(s.fetch('/api/members', { method: 'DELETE', body: { id: a } }))
    expect((await ledger(s)).ledger[0]!.helpers[0], 'the task keeps the fact, not the face').toMatchObject({ memberId: null, name: null })

    const old = Math.floor(Date.now() / 1000) - 40 * 86400
    await env.DB.prepare('UPDATE task_participants SET contributed_at = ? WHERE task_id = ?').bind(old, id).run()
    expect((await ledger(s)).ledger).toEqual([])
    const year = await okJson<Ledger>(s.fetch(`/api/chores-ledger?since=${old - 1}`))
    expect(year.ledger, '?since reaches back for the house diary').toHaveLength(1)
  })

  it('another household’s work is not on my ledger', async () => {
    const s = await household('turns-other-a', undefined, { empty: true })
    const other = await household('turns-other-b', undefined, { empty: true })
    await tick(other, await add(other, {}))
    expect((await ledger(s)).ledger).toEqual([])
  })
})
