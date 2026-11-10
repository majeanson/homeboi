import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { deleteHousehold } from '../functions/_lib/demoHousehold'
import { localDayStart } from '../functions/_lib/ids'
import type { Env } from '../functions/_lib/env'
import type { BoardWire, CerclePet, TasksWire, TodosWire } from '../functions/_lib/wire'

// L'ALLURE D'UNE TÂCHE against a real D1 (migration 0148): `icon` on the three task tables and on
// `pets`, `colour` born nullable on `todos`. The rule from the phase-2 review: every new column
// read goes through the real endpoint with rows that hold NULL in it, because a mock cannot
// say whether a SELECT names a column the schema has, and NULL is where SQL lies.

const tasks = (s: Session) => okJson<TasksWire>(s.fetch('/api/tasks'))
const todos = (s: Session) => okJson<TodosWire>(s.fetch('/api/todos'))
const post = (s: Session, path: string, body: Record<string, unknown>) => okJson<{ id: string }>(s.fetch(`/api/${path}`, { method: 'POST', body }))
const patch = (s: Session, path: string, body: Record<string, unknown>) => s.fetch(`/api/${path}`, { method: 'PATCH', body })
const lookIn = (xs: { id: string; icon: string | null; color: string | null }[], id: string) => {
  const x = xs.find((r) => r.id === id)
  return x ? { icon: x.icon, color: x.color } : undefined
}

describe('the look of a task', () => {
  it('a chore: no icon reads null, an emoji round-trips, null puts the subject back', async () => {
    const s = await household('look-chore', undefined, { empty: true })
    const plain = await post(s, 'chores', { title: 'Bac' })
    const dressed = await post(s, 'chores', { title: 'Gouttières', icon: '🍂' })
    let got = await tasks(s)
    // No colour picked is NULL since 0153 (`hexColorOrNull`, as a to-do always was), and reads as the sage default.
    expect(lookIn(got.tasks, plain.id)).toEqual({ icon: null, color: null })
    expect(lookIn(got.tasks, dressed.id)?.icon).toBe('🍂')
    const chores = await okJson<{ chores: { id: string; icon: string | null }[] }>(s.fetch('/api/chores'))
    expect(chores.chores.find((c) => c.id === dressed.id)?.icon, 'the form opens on what was stored').toBe('🍂')
    await patch(s, 'chores', { id: dressed.id, icon: null })
    got = await tasks(s)
    expect(lookIn(got.tasks, dressed.id)?.icon).toBeNull()
  })

  it('an icon that is not an emoji stores NULL', async () => {
    const s = await household('look-garbage', undefined, { empty: true })
    const a = await post(s, 'chores', { title: 'A', icon: 'DROP TABLE' })
    const b = await post(s, 'todos', { title: 'B', icon: '🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂' })
    expect(await env.DB.prepare('SELECT icon FROM home_projects WHERE id = ?').bind(a.id).first()).toEqual({ icon: null })
    expect(await env.DB.prepare('SELECT icon FROM home_projects WHERE id = ?').bind(b.id).first()).toEqual({ icon: null })
  })

  it('a to-do: icon and colour NULL read back open, on both endpoints, beside a dressed one', async () => {
    const s = await household('look-todo', undefined, { empty: true })
    const plain = await post(s, 'todos', { title: 'Ouvert' })
    const dressed = await post(s, 'todos', { title: 'Habillé', icon: '🐶', color: '#B06A93' })
    const bad = await post(s, 'todos', { title: 'Mauvaise couleur', color: 'red' })
    const t = await todos(s)
    expect(lookIn(t.todos, plain.id), 'NULL in both new columns still reads as an open row').toEqual({ icon: null, color: null })
    expect(lookIn(t.todos, dressed.id)).toEqual({ icon: '🐶', color: '#B06A93' })
    expect(lookIn(t.todos, bad.id)).toEqual({ icon: null, color: null })
    expect(lookIn((await tasks(s)).tasks, plain.id)).toEqual({ icon: null, color: null })
    expect(lookIn((await tasks(s)).tasks, dressed.id)).toEqual({ icon: '🐶', color: '#B06A93' })
    const all = await tasks(s)
    expect(all.tasks.map((x) => x.id).sort()).toEqual([plain.id, dressed.id, bad.id].sort())
    expect(lookIn(all.tasks, dressed.id)).toEqual({ icon: '🐶', color: '#B06A93' })
    // Each half on its own: clearing the icon leaves the colour.
    await patch(s, 'todos', { id: dressed.id, icon: null })
    expect(await env.DB.prepare('SELECT icon, colour FROM home_projects WHERE id = ?').bind(dressed.id).first()).toEqual({ icon: null, colour: '#B06A93' })
    await patch(s, 'todos', { id: dressed.id, color: null })
    expect(await env.DB.prepare('SELECT icon, colour FROM home_projects WHERE id = ?').bind(dressed.id).first()).toEqual({ icon: null, colour: null })
  })

  it('a home project: the icon reaches the board, the Tâches view and the project as a subject', async () => {
    const s = await household('look-home', undefined, { empty: true })
    const today = localDayStart(new Date())
    const plain = await post(s, 'home-projects', { title: 'Toit', kind: 'upkeep', at: today })
    const plan = await post(s, 'home-projects', { title: 'Le jardin', kind: 'plan', icon: '🌱', at: today })
    const board = await okJson<BoardWire>(s.fetch('/api/board'))
    expect(lookIn(board.tasks, plain.id)?.icon).toBeNull()
    expect(lookIn(board.tasks, plan.id)?.icon).toBe('🌱')
    const got = await tasks(s)
    expect(got.subjects.projects.find((p) => p.id === plan.id)?.icon).toBe('🌱')
    await patch(s, 'home-projects', { id: plan.id, icon: '🌻' })
    expect(await env.DB.prepare('SELECT icon FROM home_projects WHERE id = ?').bind(plan.id).first()).toEqual({ icon: '🌻' })
  })

  it('a pet: no icon reads null, one round-trips through /api/pets, /api/cercle and the subjects', async () => {
    const s = await household('look-pet', undefined, { empty: true })
    const rex = await post(s, 'pets', { name: 'Rex' })
    const minou = await post(s, 'pets', { name: 'Minou', icon: '🐈' })
    const pets = await okJson<{ pets: CerclePet[] }>(s.fetch('/api/pets'))
    expect(pets.pets.find((p) => p.id === rex.id)?.icon).toBeNull()
    expect(pets.pets.find((p) => p.id === minou.id)?.icon).toBe('🐈')
    const cercle = await okJson<{ pets: CerclePet[] }>(s.fetch('/api/cercle'))
    expect(cercle.pets.find((p) => p.id === minou.id)?.icon).toBe('🐈')
    await patch(s, 'pets', { id: rex.id, icon: '🐕' })
    const got = await tasks(s)
    expect(got.subjects.pets.find((p) => p.id === rex.id)?.icon).toBe('🐕')
    await patch(s, 'pets', { id: rex.id, name: 'Rex II' })
    expect(await env.DB.prepare('SELECT icon FROM pets WHERE id = ?').bind(rex.id).first(), 'an edit that does not send the icon keeps it').toEqual({ icon: '🐕' })
  })

  it('the sandbox sweep is not tripped by the new columns', async () => {
    const s = await household('look-sweep', undefined, { empty: true })
    const a = await post(s, 'todos', { title: 'A', icon: '🧹', color: '#88A36F' })
    await deleteHousehold(env as unknown as Env, s.householdId)
    expect(await env.DB.prepare('SELECT id FROM home_projects WHERE id = ?').bind(a.id).first()).toBeNull()
  })
})
