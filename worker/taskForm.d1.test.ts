import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { localDayStart, addLocalDays } from '../functions/_lib/ids'
import type { TasksWire } from '../functions/_lib/wire'

// THE ONE TASK FORM against a real D1 (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). Since the
// merge (0150) the form writes ONE endpoint, /api/tasks, and the server picks the face: a task
// (no kind, 0153) or a home row. Each write is read back through the real endpoints, with NULL
// in every optional column (the phase-2 lesson: a NULL predicate once hid every open to-do, and
// a mock could not see it):
//   · the save adapter's body lands on the face `taskTarget` names and reads back OPEN on
//     /api/tasks. The bodies below are the ones `taskWrite` builds (src/lib/taskSave.test.ts
//     pins the same literals: the adapter imports browser modules workerd cannot load);
//   · its day is stored as a household-local midnight, the one encoding (_lib/taskDay);
//   · an edit keeps its face while it shows every layer, and MOVES UP otherwise (`faceAfter`),
//     on the same id; a departure instance keeps its own day, which is what sweeps it;
//   · the capture spine routes « task » and « upkeep » through the same rule as the form.

const tasks = (s: Session) => okJson<TasksWire>(s.fetch('/api/tasks'))
const write = async (s: Session, body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') => {
  const res = await s.fetch('/api/tasks', { method, body })
  expect(res.status, `${method} /api/tasks`).toBe(200)
  return (await res.json()) as { id?: string; face: string }
}
// What `taskWrite` sends, every optional layer left empty (taskSave.test.ts, BARE).
const draft = (over: Record<string, unknown>) => ({
  title: 't',
  subject: null,
  icon: null,
  color: null,
  effort: null,
  at: null,
  recur: null,
  recurFrom: 'anchor',
  leadSeconds: null,
  announceEvening: false,
  rotation: [],
  notes: null,
  budgetCents: null,
  kind: null,
  ...over,
})
const UTC = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000)
const LOCAL = (y: number, m: number, d: number) => localDayStart(new Date(Date.UTC(y, m - 1, d, 12)))
const WEEKLY = { freq: 'weekly', interval: 1, weekdays: [2] }
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const capture = async (s: Session, text: string, forceType: string) =>
  okJson<{ type: string; routed: { kind: string; cleanup: { table: string; id: string }[] } }>(s.fetch('/api/capture', { method: 'POST', body: { text, forceType } }))
const stored = (id: string, cols: string) => env.DB.prepare(`SELECT ${cols} FROM home_projects WHERE id = ?`).bind(id).first()

describe('the one form’s writes', () => {
  it('a bare title, a dated title, a recurrence and notes each wear the face the rule says, and read back open', async () => {
    const s = await household('form-route', undefined, { empty: true })
    const day = LOCAL(2030, 3, 14)
    const bare = await write(s, draft({ title: 'Appeler la garderie' }))
    const dated = await write(s, draft({ title: 'Formulaire', at: day }))
    const weekly = await write(s, draft({ title: 'Sortir le bac', recur: WEEKLY, at: LOCAL(2030, 3, 12) }))
    const noted = await write(s, draft({ title: 'Cuisine', notes: 'trois devis', budgetCents: 1_500_000, kind: 'plan' }))
    expect([bare.face, dated.face, weekly.face, noted.face]).toEqual(['task', 'task', 'task', 'home'])

    const got = await tasks(s)
    const by = (id?: string) => got.tasks.find((x) => x.id === id)
    for (const r of [bare, dated, weekly, noted]) expect(by(r.id)?.done, `${r.face} reads back open`).toBe('open')
    expect(by(bare.id)?.day, 'no date is « un jour »').toBeNull()
    expect(by(dated.id)?.day).toBe(day)
    expect(by(weekly.id)?.recurring).toBe(true)
    expect(by(weekly.id)?.source).toBe('task')
    // Every optional column the form left alone is NULL, not a default that reads as a pick.
    expect(await stored(bare.id!, "kind, icon, colour, effort, subject_kind, member_id, recur_json, lead_seconds, announce_evening, notes")).toEqual({
      kind: null,
      icon: null,
      colour: null,
      effort: null,
      subject_kind: null,
      member_id: null,
      recur_json: null,
      lead_seconds: null,
      announce_evening: null,
      notes: null,
    })
    expect(await stored(noted.id!, 'kind, notes, budget_cents, at'), 'a one-off is a project, undated').toEqual({ kind: 'plan', notes: 'trois devis', budget_cents: 1_500_000, at: null })
    // A series' start is the local midnight it was given, read back as recur_start by the alias.
    const chores = await okJson<{ chores: { id: string; recur_start: number | null }[] }>(s.fetch('/api/chores'))
    expect(chores.chores.find((c) => c.id === weekly.id)?.recur_start).toBe(LOCAL(2030, 3, 12))
  })

  it('a bundle from before 0153 sends `day` (local) beside `at` (a UTC midnight): the day wins, one encoding stored', async () => {
    const s = await household('form-old-bundle', undefined, { empty: true })
    const day = LOCAL(2030, 3, 14)
    const old = await write(s, { ...draft({ title: 'Formulaire', at: UTC(2030, 3, 14) }), day })
    expect(await stored(old.id!, 'kind, at')).toEqual({ kind: null, at: day })
    // A bare recurrence from that bundle carried no `day` and a UTC « today »: stored as the
    // day every reader showed it on.
    const series = await write(s, { ...draft({ title: 'Bac', recur: WEEKLY, at: UTC(2030, 3, 12) }), day: null })
    expect((await stored(series.id!, 'at'))?.at).toBe(localDayStart(new Date(UTC(2030, 3, 12) * 1000)))
  })

  it('a person on a one-off date goes home, and the door’s kind wins', async () => {
    const s = await household('form-who', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const job = await write(s, draft({ title: 'Peinturer', at: LOCAL(2030, 3, 14), rotation: [lea] }))
    const door = await write(s, draft({ title: 'Gouttières', kind: 'upkeep' }))
    const got = await tasks(s)
    expect(job.face).toBe('home')
    expect(got.tasks.find((x) => x.id === job.id)?.who_id).toBe(lea)
    expect(await stored(job.id!, 'kind, at')).toEqual({ kind: 'plan', at: LOCAL(2030, 3, 14) })
    expect(await stored(door.id!, 'kind')).toEqual({ kind: 'upkeep' })
  })

  it('an edit keeps its face while it can, and a task’s day and subject change after creation', async () => {
    const s = await household('form-edit', undefined, { empty: true })
    const carnet = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Notre maison', kind: 'home' } }))
    const made = await write(s, draft({ title: 'Vérifier le toit' }))
    const id = made.id!
    const day = LOCAL(2030, 5, 2)
    const edited = await write(s, { id, ...draft({ title: 'Vérifier le toit', at: day, subject: { kind: 'carnet', id: carnet.id } }) }, 'PATCH')
    expect(edited.face).toBe('task')
    expect(await stored(id, 'kind, at, subject_kind, subject_id, carnet_id')).toEqual({ kind: null, at: day, subject_kind: 'carnet', subject_id: carnet.id, carnet_id: null })
    // Clearing both puts « un jour » and « sans sujet » back, and it still reads open.
    await write(s, { id, ...draft({ title: 'Vérifier le toit' }) }, 'PATCH')
    expect(await stored(id, 'at, subject_kind')).toEqual({ at: null, subject_kind: null })
    expect((await tasks(s)).tasks.find((x) => x.id === id)?.done, 'a standing task with NULL day reads open').toBe('open')
  })

  it('an edit that adds a layer its face does not show moves the row UP, same id, nothing lost', async () => {
    const s = await household('form-up', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const id = (await write(s, draft({ title: 'Sortir le bac' }))).id!
    // A person and a schedule on a task: still a task, which holds them.
    const series = await write(s, { id, ...draft({ title: 'Sortir le bac', rotation: [lea], recur: WEEKLY, at: LOCAL(2030, 3, 12), announceEvening: true }) }, 'PATCH')
    expect(series.face).toBe('task')
    expect(await stored(id, 'kind, at, rotation_json, announce_evening')).toEqual({ kind: null, at: LOCAL(2030, 3, 12), rotation_json: JSON.stringify([lea]), announce_evening: 1 })
    // Its tick logs « qui a aidé », through the one door.
    await okJson(s.fetch('/api/tasks', { method: 'PATCH', body: { id, done: true } }))
    // Notes on it: a home row (a recurrence is upkeep). The evening line is the one layer no face
    // shows beside notes: the form says so, and the row does not pretend to keep it.
    const toHome = await write(s, { id, ...draft({ title: 'Sortir le bac', rotation: [lea], recur: WEEKLY, at: LOCAL(2030, 3, 12), announceEvening: true, notes: 'le bleu' }) }, 'PATCH')
    expect(toHome.face).toBe('home')
    expect(await stored(id, 'kind, notes, announce_evening')).toEqual({ kind: 'upkeep', notes: 'le bleu', announce_evening: null })
    // Never down: emptied of its layers, it stays a home row (a project or upkeep keeps its kind).
    const back = await write(s, { id, ...draft({ title: 'Sortir le bac' }) }, 'PATCH')
    expect(back.face).toBe('home')
    expect(await stored(id, 'kind')).toEqual({ kind: 'upkeep' })
    // The log line it earned is still there, and the delete takes it with the row.
    const lines = () => env.DB.prepare('SELECT COUNT(*) AS n FROM task_participants WHERE task_id = ?').bind(id).first<{ n: number }>()
    expect((await lines())?.n).toBe(1)
    await okJson(s.fetch('/api/tasks', { method: 'DELETE', body: { id } }))
    expect(await stored(id, 'id')).toBeNull()
    expect((await lines())?.n).toBe(0)
  })

  it('a departure instance keeps its own day: that day is what sweeps it', async () => {
    const s = await household('form-departure', undefined, { empty: true })
    const today = localDayStart(new Date())
    const made = await okJson<{ id: string }>(s.fetch('/api/todos', { method: 'POST', body: { title: 'Clés', departure: true, section: 'Partir', day: today } }))
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: made.id, day: addLocalDays(today, 3) } })
    expect((await env.DB.prepare('SELECT day FROM todos WHERE id = ?').bind(made.id).first<{ day: number }>())?.day).toBe(today)
    expect(await stored(made.id, 'id'), 'a departure instance is not a task: it never reaches the spine').toBeNull()
  })
})

describe('capture lands like the form', () => {
  it('« chaque mardi » said as a task or as an upkeep is the same weekly task', async () => {
    const s = await household('capture-weekly', undefined, { empty: true })
    const a = await capture(s, 'sortir les poubelles chaque mardi', 'task')
    const b = await capture(s, 'sortir les poubelles chaque mardi', 'upkeep')
    expect([a.type, b.type, a.routed.kind, b.routed.kind]).toEqual(['task', 'task', 'task', 'task'])
    expect([a.routed.cleanup[0]?.table, b.routed.cleanup[0]?.table]).toEqual(['home_projects', 'home_projects'])
    const rows = await env.DB.prepare("SELECT kind, recur_json, rotation_json FROM home_projects WHERE household_id = ?").bind(s.householdId).all<{ kind: string | null; recur_json: string }>()
    expect(rows.results.map((r) => [r.kind, JSON.parse(r.recur_json)])).toEqual([
      [null, { freq: 'weekly', interval: 1, weekdays: [2] }],
      [null, { freq: 'weekly', interval: 1, weekdays: [2] }],
    ])
    // The same layers typed into the form wear the same face: taskTarget.test.ts, « a recurrence is a task ».
  })

  it('a task with no schedule reads open, and its correction deletes it', async () => {
    const s = await household('capture-todo', undefined, { empty: true })
    const r = await capture(s, 'appeler la garderie', 'task')
    expect(r.routed.cleanup[0]?.table).toBe('home_projects')
    const id = r.routed.cleanup[0]!.id
    expect(await stored(id, 'kind')).toEqual({ kind: null })
    const got = await tasks(s)
    expect(got.tasks.find((x) => x.id === id)?.done).toBe('open')
    expect(got.tasks.find((x) => x.id === id)?.day).toBeNull()
    // « Non, plutôt une note »: the correction removes exactly the task it made.
    await s.fetch('/api/capture', { method: 'POST', body: { text: 'appeler la garderie', forceType: 'note', undo: r.routed.cleanup } })
    expect(await stored(id, 'id')).toBeNull()
  })

  it('a correction sent by a tab from before the merge (`tasks`, `todos`) still finds the row', async () => {
    const s = await household('capture-legacy', undefined, { empty: true })
    const r = await capture(s, 'appeler la garderie', 'task')
    const id = r.routed.cleanup[0]!.id
    await s.fetch('/api/capture', { method: 'POST', body: { text: 'appeler la garderie', forceType: 'note', undo: [{ table: 'todos', id }] } })
    expect(await stored(id, 'id')).toBeNull()
    const w = await capture(s, 'sortir le bac chaque mardi', 'task')
    const wid = w.routed.cleanup[0]!.id
    await s.fetch('/api/capture', { method: 'POST', body: { text: 'sortir le bac', forceType: 'note', undo: [{ table: 'tasks', id: wid }] } })
    expect(await stored(wid, 'id')).toBeNull()
  })

  it('« chaque automne » is a yearly task anchored on its season, a local midnight', async () => {
    const s = await household('capture-season', undefined, { empty: true })
    const r = await capture(s, 'nettoyer les gouttières chaque automne', 'upkeep')
    const row = await stored(r.routed.cleanup[0]!.id, 'kind, recur_json, at')
    expect(row!.kind).toBeNull()
    expect(JSON.parse(row!.recur_json as string)).toEqual({ freq: 'yearly', interval: 1 })
    expect(row!.at).toBe(localDayStart(new Date((row!.at as number) * 1000)))
  })
})
