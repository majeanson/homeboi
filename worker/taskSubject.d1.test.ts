import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { deleteHousehold } from '../functions/_lib/demoHousehold'
import type { Env } from '../functions/_lib/env'

// « SUR QUOI ? » against a real D1 (migration 0146): one soft ref on the three task tables.
// What only a real schema can say: the columns exist on all three, a foreign id stores NULL,
// a carnet on home_projects stays in carnet_id, and dropping the subject touches no task.

const carnet = (s: Session, name = 'Maison') => okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name } }))
const member = async (s: Session) =>
  (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))).id

const row = (table: string, id: string) =>
  env.DB.prepare(`SELECT subject_kind, subject_id FROM ${table} WHERE id = ?`).bind(id).first<{ subject_kind: string | null; subject_id: string | null }>()
const addChore = (s: Session, subject?: unknown) => okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Gouttières', subject } }))
const addTodo = (s: Session, subject?: unknown) => okJson<{ id: string }>(s.fetch('/api/todos', { method: 'POST', body: { title: 'Appeler', subject } }))
const addProject = (s: Session, body: Record<string, unknown>) =>
  okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Toit', kind: 'upkeep', ...body } }))

describe('the subject of a task', () => {
  it('a chore and a todo take a subject on POST and on PATCH, and clear it with null', async () => {
    const s = await household('subject-rw', undefined, { empty: true })
    const c = await carnet(s)
    const chore = await addChore(s, { kind: 'carnet', id: c.id })
    expect(await row('home_projects', chore.id)).toEqual({ subject_kind: 'carnet', subject_id: c.id })
    const todo = await addTodo(s)
    expect(await row('home_projects', todo.id)).toEqual({ subject_kind: null, subject_id: null })
    expect((await s.fetch('/api/todos', { method: 'PATCH', body: { id: todo.id, subject: { kind: 'carnet', id: c.id } } })).status).toBe(200)
    expect(await row('home_projects', todo.id)).toEqual({ subject_kind: 'carnet', subject_id: c.id })
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id, subject: null } })
    expect(await row('home_projects', chore.id)).toEqual({ subject_kind: null, subject_id: null })
  })

  it('a subject the household does not own stores NULL, not a link across households', async () => {
    const s = await household('subject-mine', undefined, { empty: true })
    const other = await household('subject-theirs', undefined, { empty: true })
    const theirs = await carnet(other, 'Autre')
    const chore = await addChore(s, { kind: 'carnet', id: theirs.id })
    expect(await row('home_projects', chore.id)).toEqual({ subject_kind: null, subject_id: null })
    const garbage = await addTodo(s, { kind: 'moon', id: 'x' })
    expect(await row('home_projects', garbage.id)).toEqual({ subject_kind: null, subject_id: null })
  })

  it('home_projects: a carnet stays in carnet_id, any other kind clears it — one subject', async () => {
    const s = await household('subject-home', undefined, { empty: true })
    const c = await carnet(s)
    const m = await member(s)
    const made = await addProject(s, { subject: { kind: 'carnet', id: c.id } })
    const read = () =>
      env.DB.prepare('SELECT carnet_id, subject_kind, subject_id FROM home_projects WHERE id = ?').bind(made.id).first<Record<string, string | null>>()
    expect(await read()).toEqual({ carnet_id: c.id, subject_kind: null, subject_id: null })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: made.id, subject: { kind: 'person', id: m } } })
    expect(await read()).toEqual({ carnet_id: null, subject_kind: 'person', subject_id: m })
    // The older door still means one subject.
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: made.id, carnetId: c.id } })
    expect(await read()).toEqual({ carnet_id: c.id, subject_kind: null, subject_id: null })
  })

  it('a project cannot be its own subject, and only a plan can be a project', async () => {
    const s = await household('subject-self', undefined, { empty: true })
    const plan = await addProject(s, { kind: 'plan' })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: plan.id, subject: { kind: 'project', id: plan.id } } })
    expect(await row('home_projects', plan.id)).toEqual({ subject_kind: null, subject_id: null })
    const upkeep = await addProject(s, {})
    const chore = await addChore(s, { kind: 'project', id: upkeep.id })
    expect(await row('home_projects', chore.id)).toEqual({ subject_kind: null, subject_id: null })
    const onPlan = await addChore(s, { kind: 'project', id: plan.id })
    expect(await row('home_projects', onPlan.id)).toEqual({ subject_kind: 'project', subject_id: plan.id })
  })

  it('deleting the subject leaves the task, and the sweep is not tripped by the ref', async () => {
    const s = await household('subject-gone', undefined, { empty: true })
    const c = await carnet(s)
    const chore = await addChore(s, { kind: 'carnet', id: c.id })
    await env.DB.prepare('DELETE FROM carnets WHERE id = ?').bind(c.id).run()
    expect(await row('home_projects', chore.id), 'an orphan ref stays as it was: no cascade, no rewrite').toEqual({ subject_kind: 'carnet', subject_id: c.id })
    await deleteHousehold(env as unknown as Env, s.householdId)
    expect(await row('home_projects', chore.id)).toBeNull()
  })
})
