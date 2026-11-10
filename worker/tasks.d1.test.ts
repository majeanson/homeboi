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

describe('the task writes', () => {
  it('an open standing to-do reads back, ticked today stays, ticked earlier has cleared', async () => {
    // Review catch, 2026-11-08: the end-of-day clause read NULL for an open row and hid it.
    // Planted red by dropping « done_at IS NOT NULL » from GET /api/todos.
    const s = await household('tasks-open-undated', undefined, { empty: true })
    await addTodo(s, { title: 'Ouvert' })
    const ticked = await addTodo(s, { title: 'Coché' })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: ticked.id, done: true } })
    const old = await addTodo(s, { title: 'Hier' })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: old.id, done: true, doneAt: today() - 600 } })
    const got = await todos(s)
    expect(titles(got.todos)).toEqual(['Coché', 'Ouvert'])
    expect(titles((await tasks(s)).tasks)).toEqual(['Coché', 'Ouvert'])
  })

  it('an untick with nothing ticked leaves the turn where it is', async () => {
    const s = await household('tasks-untick-noop', undefined, { empty: true })
    const chore = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Bac', rotation: ['a', 'b'] } }))
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id, undo: true } })
    expect(await env.DB.prepare('SELECT current_idx FROM home_projects WHERE id = ?').bind(chore.id).first()).toEqual({ current_idx: 0 })
  })

  it('a tick keeps its real moment, however late it reaches the server', async () => {
    const s = await household('tasks-offline', undefined, { empty: true })
    const last = today() - 600 // 23:50 last night, held in the outbox past midnight
    const todo = await addTodo(s, { title: 'Formulaire' })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: todo.id, done: true, doneAt: last } })
    expect(await env.DB.prepare('SELECT last_done_at AS done_at FROM home_projects WHERE id = ?').bind(todo.id).first()).toEqual({ done_at: last })
    expect((await tasks(s)).tasks, 'its day has passed: already cleared').toEqual([])

    const chore = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Bac' } }))
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id, complete: true, doneAt: last } })
    expect(await env.DB.prepare('SELECT last_done_at FROM home_projects WHERE id = ?').bind(chore.id).first()).toEqual({ last_done_at: last })
  })

  it('a clock in the future cannot stamp the future', async () => {
    const s = await household('tasks-clock', undefined, { empty: true })
    const todo = await addTodo(s, { title: 'Formulaire' })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: todo.id, done: true, doneAt: Math.floor(Date.now() / 1000) + 86400 } })
    const row = await env.DB.prepare('SELECT last_done_at AS done_at FROM home_projects WHERE id = ?').bind(todo.id).first<{ done_at: number }>()
    expect(row!.done_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
  })

  it('a one-off unticks: the stamp, the turn and the log line all go back', async () => {
    const s = await household('tasks-untick', undefined, { empty: true })
    const a = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const b = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Noah' } }))
    const chore = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Bac', rotation: [a.id, b.id] } }))
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id, complete: true } })
    await s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id, undo: true } })
    expect(await env.DB.prepare('SELECT last_done_at, current_idx FROM home_projects WHERE id = ?').bind(chore.id).first()).toEqual({ last_done_at: null, current_idx: 0 })
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM task_participants WHERE task_id = ?').bind(chore.id).first()).toEqual({ n: 0 })

    const home = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Filtre', kind: 'upkeep', at: today() } }))
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: home.id } })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: home.id, undo: true } })
    expect((await board(s)).tasks.map((t) => t.done)).toEqual(['open'])
  })

  it('« Vider les cochés » leaves the row as history and keeps every other row', async () => {
    const s = await household('tasks-clearsoon', undefined, { empty: true })
    const home = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Filtre', kind: 'upkeep', at: today() } }))
    const keep = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Toit', kind: 'upkeep', at: today() } }))
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: home.id } })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { clearChecked: true, ids: [home.id] } })
    expect((await board(s)).tasks.map((t) => t.id)).toEqual([keep.id])
    expect(await env.DB.prepare('SELECT last_done_at IS NOT NULL AS kept FROM home_projects WHERE id = ?').bind(home.id).first()).toEqual({ kept: 1 })
  })
})

// ONE GESTURE PER QUESTION (0153, the owner's decisions of 2026-11-10), whatever a task used to
// be, through the one door (/api/tasks) and through the aliases an older bundle still calls.
describe('the one tick, the one « Vider », the one delete', () => {
  const lines = (id: string) => env.DB.prepare('SELECT member_id FROM task_participants WHERE task_id = ? ORDER BY contributed_at').bind(id).all<{ member_id: string | null }>()
  const row = (id: string) => env.DB.prepare('SELECT kind, last_done_at, last_done_by, current_idx, cleared_at FROM home_projects WHERE id = ?').bind(id).first<{ kind: string | null; last_done_at: number | null; last_done_by: string | null; current_idx: number; cleared_at: number | null }>()
  const tick = (s: Session, id: string, headers?: Record<string, string>) => s.fetch('/api/tasks', { method: 'PATCH', body: { id, done: true }, headers })

  it('every tick records who did it: the face the device acts as, else whose turn it was', async () => {
    const s = await household('gesture-who', undefined, { empty: true })
    const lea = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const noah = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Noah' } }))
    // What used to be a to-do (no kind, no one named): its tick is logged, by the acting face.
    const plain = await addTodo(s, { title: 'Formulaire' })
    expect((await tick(s, plain.id, { 'X-Profile': lea.id })).status).toBe(200)
    expect((await lines(plain.id)).results).toEqual([{ member_id: lea.id }])
    expect(await row(plain.id)).toMatchObject({ kind: null, last_done_by: lea.id, current_idx: 0 })
    // With no face picked, a series with a turn logs whose turn it was, and the turn passes.
    const series = await okJson<{ id: string }>(s.fetch('/api/tasks', { method: 'POST', body: { title: 'Bac', recur: { freq: 'weekly', interval: 1, weekdays: [] }, rotation: [lea.id, noah.id] } }))
    await tick(s, series.id)
    expect((await lines(series.id)).results).toEqual([{ member_id: lea.id }])
    expect(await row(series.id)).toMatchObject({ kind: null, last_done_by: lea.id, current_idx: 1 })
    // Noah's turn, but Léa did it: she is who did it, and the turn still passes on.
    await tick(s, series.id, { 'X-Profile': lea.id })
    expect((await lines(series.id)).results.map((r) => r.member_id)).toEqual([lea.id, lea.id])
    expect((await row(series.id))?.current_idx).toBe(0)
  })

  it('the turn passes ONLY with « chacun son tour »: one person or nobody stays where they are', async () => {
    const s = await household('gesture-turn', undefined, { empty: true })
    const lea = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const one = await okJson<{ id: string }>(s.fetch('/api/tasks', { method: 'POST', body: { title: 'Ranger', recur: { freq: 'daily', interval: 1 }, rotation: [lea.id] } }))
    const none = await okJson<{ id: string }>(s.fetch('/api/tasks', { method: 'POST', body: { title: 'Arroser', recur: { freq: 'daily', interval: 1 } } }))
    await tick(s, one.id)
    await tick(s, none.id)
    expect((await row(one.id))?.current_idx).toBe(0)
    expect((await row(none.id))?.current_idx).toBe(0)
    expect((await lines(one.id)).results).toEqual([{ member_id: lea.id }])
    expect((await lines(none.id)).results, 'nobody named, no face: logged as nobody').toEqual([{ member_id: null }])
  })

  it('an untick puts back what the tick moved, the log line included', async () => {
    const s = await household('gesture-untick', undefined, { empty: true })
    const t = await addTodo(s, { title: 'Formulaire' })
    await tick(s, t.id)
    await s.fetch('/api/tasks', { method: 'PATCH', body: { id: t.id, done: false } })
    expect(await row(t.id)).toMatchObject({ last_done_at: null, last_done_by: null })
    expect((await lines(t.id)).results).toEqual([])
  })

  it('« Vider les cochés » keeps every task as history, through the door and through each alias', async () => {
    const s = await household('gesture-clear', undefined, { empty: true })
    const a = await addTodo(s, { title: 'A' })
    const b = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'B' } }))
    const c = await addTodo(s, { title: 'C' })
    for (const x of [a, b, c]) await tick(s, x.id)
    expect((await s.fetch('/api/tasks', { method: 'PATCH', body: { clearChecked: true, ids: [a.id] } })).status).toBe(200)
    expect((await s.fetch('/api/todos', { method: 'PATCH', body: { clearChecked: true, ids: [b.id] } })).status).toBe(200)
    expect((await s.fetch('/api/chores', { method: 'PATCH', body: { clearChecked: true, ids: [c.id] } })).status).toBe(200)
    for (const x of [a, b, c]) expect((await row(x.id))?.cleared_at, 'stamped, never deleted').not.toBeNull()
    expect((await tasks(s)).tasks, 'out of the day').toEqual([])
  })

  it('a stale tmp- id heals onto the same ticked task, and a clear or a delete with nothing to act on is a 404', async () => {
    const s = await household('gesture-heal', undefined, { empty: true })
    const t = await addTodo(s, { title: 'Formulaire' })
    await tick(s, t.id)
    const asOf = Math.floor(Date.now() / 1000) + 5
    const healed = await s.fetch('/api/tasks', { method: 'PATCH', body: { clearChecked: true, ids: ['tmp-gone'], items: [{ id: 'tmp-gone', text: 'formulaire' }], asOf } })
    expect(healed.status).toBe(200)
    expect((await row(t.id))?.cleared_at).not.toBeNull()
    expect((await s.fetch('/api/tasks', { method: 'PATCH', body: { clearChecked: true, ids: ['tmp-none'], items: [{ id: 'tmp-none', text: 'rien' }], asOf } })).status).toBe(404)
    // The delete: a stale id heals onto the task of the same name that existed at the gesture.
    const u = await addTodo(s, { title: 'Appeler' })
    const del = await s.fetch('/api/tasks', { method: 'DELETE', body: { id: 'tmp-old', text: 'appeler', asOf } })
    expect(del.status).toBe(200)
    expect(await row(u.id)).toBeNull()
    expect((await s.fetch('/api/tasks', { method: 'DELETE', body: { id: 'tmp-old', text: 'appeler', asOf } })).status, 'nothing left: a 404, never a vacuous ok').toBe(404)
    expect((await s.fetch('/api/chores', { method: 'DELETE', body: { id: 'nope' } })).status).toBe(404)
  })

  it('a tick replayed from the outbox after midnight keeps its real day, through the one door', async () => {
    const s = await household('gesture-offline', undefined, { empty: true })
    const t = await addTodo(s, { title: 'Formulaire', day: today() - 86400 + 3600 })
    const last = today() - 600
    await s.fetch('/api/tasks', { method: 'PATCH', body: { id: t.id, done: true, doneAt: last } })
    expect((await row(t.id))?.last_done_at).toBe(last)
    expect((await tasks(s)).tasks, 'its day has passed: already cleared').toEqual([])
  })

  it('a day sent by any door is stored as a household-local midnight', async () => {
    const s = await household('gesture-day', undefined, { empty: true })
    const noon = today() + 12 * 3600
    const t = await addTodo(s, { title: 'Midi', day: noon })
    const c = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Bac', recur: { freq: 'weekly', interval: 1, weekdays: [] }, start: noon } }))
    const h = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Filtre', kind: 'upkeep', at: noon } }))
    const at = async (id: string) => (await env.DB.prepare('SELECT at FROM home_projects WHERE id = ?').bind(id).first<{ at: number }>())?.at
    for (const id of [t.id, c.id, h.id]) expect(await at(id), id).toBe(today())
  })
})

describe('rotation on any recurring task', () => {
  it('a home row takes turns through the one code path, and a tick moves the turn', async () => {
    const s = await household('tasks-rotate', undefined, { empty: true })
    const a = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const b = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Noah' } }))
    const home = await okJson<{ id: string }>(
      s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Gouttières', kind: 'upkeep', at: addLocalDays(today(), -7), recur: { freq: 'weekly', interval: 1, weekdays: [] }, rotation: [a.id, b.id] } }),
    )
    const first = (await board(s)).tasks.find((t) => t.id === home.id)
    expect(first).toMatchObject({ who_id: a.id, team: [a.id, b.id] })
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: home.id } })
    expect((await tasks(s)).tasks.find((t) => t.id === home.id)).toMatchObject({ who_id: b.id, dueToday: false })
    expect(await env.DB.prepare('SELECT last_done_by FROM home_projects WHERE id = ?').bind(home.id).first()).toEqual({ last_done_by: a.id })
  })

  it('the rotation edits with the rest of the row', async () => {
    const s = await household('tasks-rotate-edit', undefined, { empty: true })
    const a = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const home = await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Toit', kind: 'plan' } }))
    await s.fetch('/api/home-projects', { method: 'PATCH', body: { id: home.id, rotation: [a.id] } })
    expect((await tasks(s)).tasks.find((t) => t.id === home.id)?.who_id).toBe(a.id)
  })
})

describe('the task read', () => {
  it('holds all three tables and keeps departure instances out', async () => {
    const s = await household('tasks-all', undefined, { empty: true })
    await s.fetch('/api/chores', { method: 'POST', body: { title: 'Sortir le bac' } })
    await s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Gouttières', kind: 'upkeep' } })
    await addTodo(s, { title: 'Appeler la garderie' })
    await addTodo(s, { title: 'Clés', departure: true, section: 'Avant de partir' })
    const { tasks: rows } = await tasks(s)
    expect(titles(rows)).toEqual(['Appeler la garderie', 'Gouttières', 'Sortir le bac'])
    expect(rows.map((r) => r.source).sort()).toEqual(['home', 'task', 'task'])
  })

  it('the bento shows due, overdue and ticked today; someday stays in the view', async () => {
    const s = await household('tasks-board', undefined, { empty: true })
    await addTodo(s, { title: 'Un jour' })
    await addTodo(s, { title: 'Pour aujourd’hui', day: today() })
    await addTodo(s, { title: 'En retard', day: addLocalDays(today(), -2) })
    await s.fetch('/api/chores', { method: 'POST', body: { title: 'Sans date' } })
    await s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Dû hier', kind: 'upkeep', at: addLocalDays(today(), -1) } })
    // One list on the board since 2026-11-08: the to-dos due or owed today ride it too.
    expect(titles((await board(s)).tasks)).toEqual(['Dû hier', 'En retard', 'Pour aujourd’hui'])
    expect(titles((await tasks(s)).tasks.filter((i) => !i.onBoard))).toEqual(['Sans date', 'Un jour'])
  })

  it('a ticked one-off stays for the day, then clears on read with the row untouched', async () => {
    const s = await household('tasks-clear', undefined, { empty: true })
    const made = await addTodo(s, { title: 'Formulaire' })
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: made.id, done: true } })
    expect((await tasks(s)).tasks.map((i) => i.done)).toEqual(['ticked'])

    // Yesterday, by hand: the only thing the end of a day changes is which side of
    // midnight the stamp sits on.
    await env.DB.prepare('UPDATE home_projects SET last_done_at = ? WHERE id = ?').bind(today() - 60, made.id).run()
    const after = await todos(s)
    expect((await tasks(s)).tasks).toEqual([])
    expect(after.todos, 'the glance drops it too').toEqual([])
    expect(await env.DB.prepare('SELECT 1 AS x FROM home_projects WHERE id = ?').bind(made.id).first(), 'not deleted: it is history').toEqual({ x: 1 })
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
    // Ticked last night (an outbox replay keeps its real moment): its log line and its stamp
    // are the same moment, so the history names it once (every tick is logged since 0153).
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: todo.id, done: true, doneAt: today() - 3600 } })
    const { history } = await tasks(s, `?subject=carnet:${c.id}`)
    expect(titles(history)).toEqual(['Appeler', 'Balayer', 'Toit'])
    expect(history.at(-1)?.title).toBe('Appeler')
    for (const line of history) expect(Object.keys(line).sort()).toEqual(['at', 'key', 'title', 'who_id'])
  })
})
