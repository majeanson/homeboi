import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'
import type { BoardWire, TasksWire, TodosWire } from '../functions/_lib/wire'

// ONE TASK, THREE TABLES, against a real D1: what the board shows, what the Tâches view shows,
// and the end-of-day clear, which has to work with nothing but a comparison on read.

const today = () => localDayStart(new Date())
const board = (s: Session) => okJson<BoardWire>(s.fetch('/api/board'))
const tasks = (s: Session, q = '') => okJson<TasksWire>(s.fetch(`/api/tasks${q}`))
const todos = (s: Session) => okJson<TodosWire>(s.fetch('/api/todos'))
const addTodo = (s: Session, body: Record<string, unknown>) => okJson<{ id: string }>(s.fetch('/api/todos', { method: 'POST', body }))
const titles = (xs: { title: string }[]) => xs.map((x) => x.title).sort()

describe('the task read', () => {
  it('holds all three tables and keeps departure instances out', async () => {
    const s = await household('tasks-all', undefined, { empty: true })
    await s.fetch('/api/chores', { method: 'POST', body: { title: 'Sortir le bac' } })
    await s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Gouttières', kind: 'upkeep' } })
    await addTodo(s, { title: 'Appeler la garderie' })
    await addTodo(s, { title: 'Clés', departure: true, section: 'Avant de partir' })
    const { tasks: rows } = await tasks(s)
    expect(titles(rows)).toEqual(['Appeler la garderie', 'Gouttières', 'Sortir le bac'])
    expect(rows.map((r) => r.source).sort()).toEqual(['chore', 'home', 'todo'])
  })

  it('the bento shows due, overdue and ticked today; someday stays in the view', async () => {
    const s = await household('tasks-board', undefined, { empty: true })
    await addTodo(s, { title: 'Un jour' })
    await addTodo(s, { title: 'Pour aujourd’hui', day: today() })
    await addTodo(s, { title: 'En retard', day: addLocalDays(today(), -2) })
    await s.fetch('/api/chores', { method: 'POST', body: { title: 'Sans date' } })
    await s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Dû hier', kind: 'upkeep', at: addLocalDays(today(), -1) } })
    expect(titles((await todos(s)).items.filter((i) => i.onBoard))).toEqual(['En retard', 'Pour aujourd’hui'])
    expect(titles((await board(s)).tasks)).toEqual(['Dû hier'])
    expect(titles((await tasks(s)).tasks.filter((i) => !i.onBoard))).toEqual(['Sans date', 'Un jour'])
  })

  it('a ticked one-off stays for the day, then clears on read with the row untouched', async () => {
    const s = await household('tasks-clear', undefined, { empty: true })
    const made = await addTodo(s, { title: 'Formulaire' })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: made.id, done: true } })
    expect((await todos(s)).items.map((i) => i.done)).toEqual(['ticked'])

    // Yesterday, by hand: the only thing the end of a day changes is which side of
    // midnight the stamp sits on.
    await env.DB.prepare('UPDATE todos SET done_at = ? WHERE id = ?').bind(today() - 60, made.id).run()
    const after = await todos(s)
    expect(after.items).toEqual([])
    expect(after.todos, 'the glance drops it too').toEqual([])
    expect(await env.DB.prepare('SELECT 1 AS x FROM todos WHERE id = ?').bind(made.id).first(), 'not deleted: it is history').toEqual({ x: 1 })
  })

  it('a checked recurring task moves on, a checked one-off does not vanish from the board', async () => {
    const s = await household('tasks-moves', undefined, { empty: true })
    const weekly = await okJson<{ id: string }>(
      s.fetch('/api/chores', { method: 'POST', body: { title: 'Bac', recur: { freq: 'weekly', interval: 1, weekdays: [] }, start: addLocalDays(today(), -7) } }),
    )
    const once = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Filtre', kind: 'upkeep', at: today() } }))
    expect(titles((await board(s)).tasks)).toEqual(['Bac', 'Filtre'])
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: weekly.id, complete: true } })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: once.id } })
    const after = await board(s)
    expect(after.tasks.map((t) => [t.title, t.done])).toEqual([['Filtre', 'ticked']])
    const moved = (await tasks(s)).tasks.find((t) => t.id === weekly.id)
    expect(moved).toMatchObject({ done: 'open', dueToday: false, day: addLocalDays(today(), 7) })
  })

  it('the subjects block names what a task is about', async () => {
    const s = await household('tasks-subjects', undefined, { empty: true })
    const c = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Le chalet' } }))
    await s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Filtre', kind: 'upkeep', carnetId: c.id } })
    const r = await tasks(s)
    expect(r.subjects.carnets.map((x) => x.name)).toEqual(['Le chalet'])
    expect(r.tasks[0]?.subject).toEqual({ kind: 'carnet', id: c.id })
    expect(r.history).toEqual([])
  })

  it('a subject’s history is names and dates, from all three tables, newest first', async () => {
    const s = await household('tasks-history', undefined, { empty: true })
    const c = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'La maison' } }))
    const subject = { kind: 'carnet', id: c.id }
    const chore = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Balayer', subject } }))
    const home = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Toit', kind: 'upkeep', subject } }))
    const todo = await addTodo(s, { title: 'Appeler', subject })
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id, complete: true } })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: home.id } })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: todo.id, done: true } })
    await env.DB.prepare('UPDATE todos SET done_at = ? WHERE id = ?').bind(today() - 3600, todo.id).run()
    const { history } = await tasks(s, `?subject=carnet:${c.id}`)
    expect(titles(history)).toEqual(['Appeler', 'Balayer', 'Toit'])
    expect(history.at(-1)?.title).toBe('Appeler')
    for (const line of history) expect(Object.keys(line).sort()).toEqual(['at', 'key', 'title', 'who_id'])
  })
})
