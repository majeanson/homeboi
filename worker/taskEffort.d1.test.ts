import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { deleteHousehold } from '../functions/_lib/demoHousehold'
import { localDayStart } from '../functions/_lib/ids'
import type { Env } from '../functions/_lib/env'
import type { BoardWire, TasksWire, TodosWire } from '../functions/_lib/wire'

// L'EFFORT D'UNE TÂCHE against a real D1 (migration 0149): `effort` on the three task tables,
// 1 to 5, NULL = not said. The rule from the phase-2 review: every new column read goes
// through the real endpoint with rows that hold NULL in it, because a mock cannot say whether
// a SELECT names a column the schema has, and NULL is where SQL lies. A row with no effort
// must read back OPEN and present, on every endpoint, beside a rated one.

const tasks = (s: Session) => okJson<TasksWire>(s.fetch('/api/tasks'))
const post = (s: Session, path: string, body: Record<string, unknown>) => okJson<{ id: string }>(s.fetch(`/api/${path}`, { method: 'POST', body }))
const patch = (s: Session, path: string, body: Record<string, unknown>) => s.fetch(`/api/${path}`, { method: 'PATCH', body })
const effortIn = (xs: { id: string; effort: number | null }[], id: string) => xs.find((r) => r.id === id)?.effort
const stored = async (table: string, id: string) => (await env.DB.prepare(`SELECT effort FROM ${table} WHERE id = ?`).bind(id).first<{ effort: number | null }>())?.effort

describe('the effort of a task', () => {
  it('a chore: unrated reads null and open, a dot round-trips, the form reads it, null clears it', async () => {
    const s = await household('effort-chore', undefined, { empty: true })
    const plain = await post(s, 'chores', { title: 'Bac' })
    const rated = await post(s, 'chores', { title: 'Gouttières', effort: 4 })
    let got = await tasks(s)
    expect(got.tasks.map((x) => x.id).sort(), 'NULL in the new column still reads as a present row').toEqual([plain.id, rated.id].sort())
    expect(effortIn(got.tasks, plain.id)).toBeNull()
    expect(effortIn(got.tasks, rated.id)).toBe(4)
    const chores = await okJson<{ chores: { id: string; effort: number | null }[] }>(s.fetch('/api/chores'))
    expect(effortIn(chores.chores, rated.id), 'the edit form opens on what was stored').toBe(4)
    expect(effortIn(chores.chores, plain.id)).toBeNull()
    await patch(s, 'chores', { id: rated.id, effort: null })
    got = await tasks(s)
    expect(effortIn(got.tasks, rated.id)).toBeNull()
    await patch(s, 'chores', { id: plain.id, title: 'Bac bleu' })
    expect(await stored('home_projects', plain.id), 'an edit that does not send the effort leaves it').toBeNull()
  })

  it('anything that is not a dot from 1 to 5 stores NULL, on POST and on PATCH', async () => {
    const s = await household('effort-garbage', undefined, { empty: true })
    const a = await post(s, 'chores', { title: 'A', effort: 0 })
    const b = await post(s, 'todos', { title: 'B', effort: 6 })
    const c = await post(s, 'home-projects', { title: 'C', kind: 'plan', effort: '3' })
    const d = await post(s, 'todos', { title: 'D', effort: 2.5 })
    expect(await stored('home_projects', a.id)).toBeNull()
    expect(await stored('home_projects', b.id)).toBeNull()
    expect(await stored('home_projects', c.id)).toBeNull()
    expect(await stored('home_projects', d.id)).toBeNull()
    await patch(s, 'todos', { id: d.id, effort: 3 })
    expect(await stored('home_projects', d.id)).toBe(3)
    await patch(s, 'todos', { id: d.id, effort: 'beaucoup' })
    expect(await stored('home_projects', d.id)).toBeNull()
  })

  it('a to-do: NULL effort reads back open on /api/todos and /api/tasks, beside a rated one', async () => {
    const s = await household('effort-todo', undefined, { empty: true })
    const today = localDayStart(new Date())
    const plain = await post(s, 'todos', { title: 'Ouvert' })
    const rated = await post(s, 'todos', { title: 'Appeler', effort: 1 })
    const dated = await post(s, 'todos', { title: 'Aujourd’hui', day: today })
    const t = await okJson<TodosWire>(s.fetch('/api/todos'))
    expect(t.todos.map((x) => x.id).sort()).toEqual([plain.id, rated.id, dated.id].sort())
    expect(effortIn(t.todos, plain.id)).toBeNull()
    expect(effortIn(t.todos, rated.id)).toBe(1)
    expect(effortIn(t.items, plain.id)).toBeNull()
    expect(effortIn(t.items, rated.id)).toBe(1)
    expect(t.items.find((x) => x.id === plain.id)?.done).toBe('open')
    const all = await tasks(s)
    expect(all.tasks.map((x) => x.id).sort()).toEqual([plain.id, rated.id, dated.id].sort())
    expect(effortIn(all.tasks, dated.id)).toBeNull()
    expect(effortIn(all.tasks, rated.id), '/api/tasks SELECTs the column for to-dos too').toBe(1)
    // A PATCH that only sends the effort leaves the look and the title alone.
    await patch(s, 'todos', { id: rated.id, effort: 5 })
    expect(await env.DB.prepare('SELECT title, effort, icon FROM home_projects WHERE id = ?').bind(rated.id).first()).toEqual({ title: 'Appeler', effort: 5, icon: null })
  })

  it('a home row: the effort reaches the board, the Tâches view and the edit form', async () => {
    const s = await household('effort-home', undefined, { empty: true })
    const today = localDayStart(new Date())
    const plain = await post(s, 'home-projects', { title: 'Toit', kind: 'upkeep', at: today })
    const rated = await post(s, 'home-projects', { title: 'Le jardin', kind: 'plan', effort: 5, at: today })
    const board = await okJson<BoardWire>(s.fetch('/api/board'))
    expect(board.tasks.map((x) => x.id).sort(), 'a NULL effort does not hide a due row from the board').toEqual([plain.id, rated.id].sort())
    expect(effortIn(board.tasks, plain.id)).toBeNull()
    expect(effortIn(board.tasks, rated.id)).toBe(5)
    expect(effortIn((await tasks(s)).tasks, rated.id)).toBe(5)
    const rows = await okJson<{ projects: { id: string; effort: number | null }[] }>(s.fetch('/api/home-projects'))
    expect(effortIn(rows.projects, rated.id)).toBe(5)
    expect(effortIn(rows.projects, plain.id)).toBeNull()
    await patch(s, 'home-projects', { id: rated.id, effort: 2 })
    expect(await stored('home_projects', rated.id)).toBe(2)
    await patch(s, 'home-projects', { id: rated.id, effort: null })
    expect(await stored('home_projects', rated.id)).toBeNull()
  })

  it('the sandbox sweep is not tripped by the new column', async () => {
    const s = await household('effort-sweep', undefined, { empty: true })
    const a = await post(s, 'todos', { title: 'A', effort: 3 })
    await deleteHousehold(env as unknown as Env, s.householdId)
    expect(await env.DB.prepare('SELECT id FROM home_projects WHERE id = ?').bind(a.id).first()).toBeNull()
  })
})
