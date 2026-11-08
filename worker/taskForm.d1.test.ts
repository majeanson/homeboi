import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { localDayStart, addLocalDays } from '../functions/_lib/ids'
import type { TasksWire, TodosWire } from '../functions/_lib/wire'

// THE ONE TASK FORM against a real D1 (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). Three things
// changed on the server and each is read back through the real endpoints, with NULL in every
// optional column (the phase-2 lesson: a NULL predicate once hid every open to-do, and a mock
// could not see it):
//   · the save adapter's bodies land in the table `taskTarget` names and read back OPEN on
//     /api/tasks. The bodies below are the ones `taskWrite` builds (src/lib/taskSave.test.ts
//     pins the same literals: the adapter imports browser modules workerd cannot load);
//   · PATCH /api/todos takes a `day` (a to-do's date is a layer of the form now), and a
//     departure instance keeps its own day, which is what sweeps it;
//   · the capture spine routes « task » and « upkeep » through the same rule as the form.

const tasks = (s: Session) => okJson<TasksWire>(s.fetch('/api/tasks'))
const write = async (s: Session, endpoint: string, body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') => {
  const res = await s.fetch(`/api/${endpoint}`, { method, body })
  expect(res.status, `${method} /api/${endpoint}`).toBe(200)
  return { endpoint, data: (await res.json()) as { id?: string } }
}
// What `taskWrite` sends for each table, every optional layer left empty (taskSave.test.ts).
const NONE = { subject: null, icon: null, color: null, effort: null }
const todo = (over: Record<string, unknown>) => ({ title: 't', ...NONE, day: null, ...over })
const chore = (over: Record<string, unknown>) => ({ title: 't', ...NONE, rotation: [], recur: null, start: null, leadSeconds: null, announceEvening: false, ...over })
const home = (over: Record<string, unknown>) => ({ title: 't', ...NONE, notes: null, budgetCents: null, at: null, recur: null, recurFrom: 'anchor', leadSeconds: null, rotation: [], ...over })
const UTC = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000)
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const capture = async (s: Session, text: string, forceType: string) =>
  (await okJson<{ type: string; routed: { kind: string; cleanup: { table: string; id: string }[] } }>(s.fetch('/api/capture', { method: 'POST', body: { text, forceType } })))

describe('the one form’s writes', () => {
  it('a bare title, a dated title, a recurrence and notes each land where the rule says, and read back open', async () => {
    const s = await household('form-route', undefined, { empty: true })
    const bare = await write(s, 'todos', todo({ title: 'Appeler la garderie' }))
    const dated = await write(s, 'todos', todo({ title: 'Formulaire', day: localDayStart(new Date(Date.UTC(2030, 2, 14, 12))) }))
    const weekly = await write(s, 'chores', chore({ title: 'Sortir le bac', recur: { freq: 'weekly', interval: 1, weekdays: [2] }, start: UTC(2030, 3, 12) }))
    const noted = await write(s, 'home-projects', home({ title: 'Cuisine', notes: 'trois devis', budgetCents: 1_500_000, kind: 'plan' }))

    const got = await tasks(s)
    const by = (id?: string) => got.tasks.find((x) => x.id === id)
    for (const r of [bare, dated, weekly, noted]) expect(by(r.data.id)?.done, `${r.endpoint} reads back open`).toBe('open')
    expect(by(bare.data.id)?.day, 'no date is « un jour »').toBeNull()
    expect(by(dated.data.id)?.day).toBe(localDayStart(new Date(Date.UTC(2030, 2, 14, 12))))
    expect(by(weekly.data.id)?.recurring).toBe(true)
    // Every optional column the form left alone is NULL, not a default that reads as a pick.
    expect(await env.DB.prepare('SELECT icon, colour, effort, subject_kind, member_id FROM todos WHERE id = ?').bind(bare.data.id).first()).toEqual({
      icon: null,
      colour: null,
      effort: null,
      subject_kind: null,
      member_id: null,
    })
    expect(await env.DB.prepare('SELECT kind, notes, budget_cents, at FROM home_projects WHERE id = ?').bind(noted.data.id).first(), 'a one-off is a project, undated').toEqual({
      kind: 'plan',
      notes: 'trois devis',
      budget_cents: 1_500_000,
      at: null,
    })
  })

  it('a person on a one-off date goes home, and the door’s kind wins', async () => {
    const s = await household('form-who', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const job = await write(s, 'home-projects', home({ title: 'Peinturer', at: UTC(2030, 3, 14), rotation: [lea], kind: 'plan' }))
    const door = await write(s, 'home-projects', home({ title: 'Gouttières', kind: 'upkeep' }))
    const got = await tasks(s)
    expect(got.tasks.find((x) => x.id === job.data.id)?.who_id).toBe(lea)
    expect((await env.DB.prepare('SELECT kind FROM home_projects WHERE id = ?').bind(door.data.id).first<{ kind: string }>())?.kind).toBe('upkeep')
  })

  it('an edit keeps its table, and a to-do’s day and subject change after creation', async () => {
    const s = await household('form-edit', undefined, { empty: true })
    const carnet = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Notre maison', kind: 'home' } }))
    const made = await write(s, 'todos', todo({ title: 'Vérifier le toit' }))
    const id = made.data.id!
    const day = localDayStart(new Date(Date.UTC(2030, 4, 2, 12)))
    // The form sends the whole draft; a to-do keeps what it can hold.
    await write(s, 'todos', { id, ...todo({ title: 'Vérifier le toit', day, subject: { kind: 'carnet', id: carnet.id } }) }, 'PATCH')
    expect(await env.DB.prepare('SELECT day, subject_kind, subject_id FROM todos WHERE id = ?').bind(id).first()).toEqual({ day, subject_kind: 'carnet', subject_id: carnet.id })
    // Clearing both puts « un jour » and « sans sujet » back, and it still reads open.
    await write(s, 'todos', { id, ...todo({ title: 'Vérifier le toit' }) }, 'PATCH')
    expect(await env.DB.prepare('SELECT day, subject_kind FROM todos WHERE id = ?').bind(id).first()).toEqual({ day: null, subject_kind: null })
    const all = await okJson<TodosWire>(s.fetch('/api/todos'))
    expect(all.items.find((x) => x.id === id)?.done, 'a standing to-do with NULL day reads open on the board').toBe('open')
  })

  it('a departure instance keeps its own day: that day is what sweeps it', async () => {
    const s = await household('form-departure', undefined, { empty: true })
    const today = localDayStart(new Date())
    const made = await okJson<{ id: string }>(s.fetch('/api/todos', { method: 'POST', body: { title: 'Clés', departure: true, section: 'Partir', day: today } }))
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: made.id, day: addLocalDays(today, 3) } })
    expect((await env.DB.prepare('SELECT day FROM todos WHERE id = ?').bind(made.id).first<{ day: number }>())?.day).toBe(today)
  })
})

describe('capture lands like the form', () => {
  it('« chaque mardi » said as a task or as an upkeep is the same weekly chore', async () => {
    const s = await household('capture-weekly', undefined, { empty: true })
    const a = await capture(s, 'sortir les poubelles chaque mardi', 'task')
    const b = await capture(s, 'sortir les poubelles chaque mardi', 'upkeep')
    expect([a.type, b.type, a.routed.kind, b.routed.kind]).toEqual(['task', 'task', 'task', 'task'])
    expect([a.routed.cleanup[0]?.table, b.routed.cleanup[0]?.table]).toEqual(['tasks', 'tasks'])
    const rows = await env.DB.prepare('SELECT recur_json, rotation_json FROM tasks WHERE household_id = ?').bind(s.householdId).all<{ recur_json: string; rotation_json: string }>()
    expect(rows.results.map((r) => JSON.parse(r.recur_json))).toEqual([
      { freq: 'weekly', interval: 1, weekdays: [2] },
      { freq: 'weekly', interval: 1, weekdays: [2] },
    ])
    // The same layers typed into the form go to the same table: taskTarget.test.ts, « a recurrence is a chore ».
  })

  it('a task with no schedule is a to-do that reads open, and its correction deletes it', async () => {
    const s = await household('capture-todo', undefined, { empty: true })
    const r = await capture(s, 'appeler la garderie', 'task')
    expect(r.routed.cleanup[0]?.table).toBe('todos')
    const id = r.routed.cleanup[0]!.id
    const got = await tasks(s)
    expect(got.tasks.find((x) => x.id === id)?.done).toBe('open')
    expect(got.tasks.find((x) => x.id === id)?.day).toBeNull()
    // « Non, plutôt une note »: the correction removes exactly the to-do it made.
    await s.fetch('/api/capture', { method: 'POST', body: { text: 'appeler la garderie', forceType: 'note', undo: r.routed.cleanup } })
    expect(await env.DB.prepare('SELECT id FROM todos WHERE id = ?').bind(id).first()).toBeNull()
  })

  it('« chaque automne » is a yearly chore anchored on its season', async () => {
    const s = await household('capture-season', undefined, { empty: true })
    const r = await capture(s, 'nettoyer les gouttières chaque automne', 'upkeep')
    const row = await env.DB.prepare('SELECT recur_json, recur_start FROM tasks WHERE id = ?').bind(r.routed.cleanup[0]!.id).first<{ recur_json: string; recur_start: number }>()
    expect(JSON.parse(row!.recur_json)).toEqual({ freq: 'yearly', interval: 1 })
    expect(row!.recur_start).toBeGreaterThan(0)
  })
})
