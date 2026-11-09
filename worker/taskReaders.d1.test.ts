import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'
import { gatherAskSnapshot } from '../functions/_lib/askSnapshot'
import type { Env } from '../functions/_lib/env'
import { recapTaskTitles } from '../functions/_lib/taskViews'
import type { BoardWire, MonthWire, TasksWire, YearWire } from '../functions/_lib/wire'

// EVERY READER OF A TASK, PINNED (plans/2026-11-06-TACHE-UNIFIEE.md). What each reader ANSWERS
// is pinned here, whole: a diff in the snapshot is a change a household would see.
//
// HISTORY. The snapshot was first written by the code before the « one row shape » rewrite
// (11b8ab05) and held still through it. On 2026-11-08 the owner chose ONE RULE PER QUESTION
// (« align every view »), which changes what several readers answer ON PURPOSE. Those changes
// are written below as explicit assertions FIRST (`the decided rules`), then the snapshot was
// regenerated; every hunk that moved is explained by one of them (the commit lists them).
//
// HOW IT STAYS STILL. The clock is pinned (fake `Date`, which the Worker in this isolate reads
// too), every row is written with fixed ids and times derived from that clock, and the few ids
// a door mints (members, the carnet, the pet, the household) are replaced by labels before the
// comparison. Two instants: a Tuesday EVENING (the « annoncer la veille » window, a weekly
// chore due tomorrow) and a Saturday MORNING (other weekdays, other cells).
//
// THE VARIETY is the merge drill's (worker/taskMerge.d1.test.ts) in the post-merge shape, with
// NULL in every optional column somewhere: every face, recurring with rotation and ledger
// lines, a chore with no start, overdue, ticked today, ticked earlier, cleared, a malformed
// recurrence, subjects of every kind, snoozed, « à partir de la dernière fois », departure
// instances, the ad-hoc sentinel, a legacy sectioned row.

type Row = Record<string, unknown>
const WEEKLY = JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [] })
const DAILY = JSON.stringify({ freq: 'daily', interval: 1 })
const MONTHLY = JSON.stringify({ freq: 'monthly', interval: 1 })
const YEARLY = JSON.stringify({ freq: 'yearly', interval: 1 })

const INSTANTS = {
  tuesdayEvening: '2026-11-11T01:30:00Z', // 20:30 in Toronto, Tue 2026-11-10
  saturdayMorning: '2026-11-14T14:00:00Z', // 09:00 in Toronto, Sat 2026-11-14
} as const

async function insertRows(table: string, rows: Row[]) {
  for (const r of rows) {
    const keys = Object.keys(r)
    await env.DB.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .bind(...keys.map((k) => r[k] ?? null))
      .run()
  }
}

interface Fixture {
  s: Session
  labels: Map<string, string>
  subjects: { kind: string; id: string }[]
  today: number
  now: number
}

async function build(tag: string, instant: string): Promise<Fixture> {
  vi.setSystemTime(new Date(instant))
  const now = Math.floor(Date.now() / 1000)
  const today = localDayStart(new Date(now * 1000))
  const D = (n: number) => addLocalDays(today, n)
  const UTC_TODAY = Math.floor(Date.UTC(new Date(now * 1000).getUTCFullYear(), new Date(now * 1000).getUTCMonth(), new Date(now * 1000).getUTCDate()) / 1000)
  const s = await household(`readers-${tag}`, undefined, { empty: true })
  const hh = s.householdId
  const mk = async (name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
  const [m1, m2, m3] = [await mk('Maman'), await mk('Papa'), await mk('Léa')]
  const carnet = (await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'La maison', kind: 'home' } }))).id
  const pet = (await okJson<{ id: string }>(s.fetch('/api/pets', { method: 'POST', body: { name: 'Biscuit' } }))).id
  const labels = new Map<string, string>([
    [hh, 'HOUSEHOLD'],
    [m1, 'MEMBER_MAMAN'],
    [m2, 'MEMBER_PAPA'],
    [m3, 'MEMBER_LEA'],
    [carnet, 'CARNET'],
    [pet, 'PET'],
  ])
  const id = (x: string) => `${tag.slice(0, 3)}${x}`
  const base = { household_id: hh, created_at: now - 30 * 86400, updated_at: now - 30 * 86400 }
  const chore = { ...base, kind: 'chore', recur_from: 'anchor' }
  const todo = { household_id: hh, kind: 'todo', colour: null, created_at: now - 5 * 86400, updated_at: now - 5 * 86400 }
  const home = { household_id: hh, created_at: now - 60 * 86400, updated_at: now - 60 * 86400 }
  await insertRows('home_projects', [
    // ── chores (the old `tasks`): `at` is the recurrence's chosen start, NULL = created_at
    { ...chore, id: id('C1aaaaaaa'), title: 'Sortir les poubelles', rotation_json: JSON.stringify([m1, m2]), current_idx: 1, last_done_at: D(-1) + 3600, last_done_by: m1, colour: '#88A36F', recur_json: WEEKLY, at: UTC_TODAY - 6 * 86400, lead_seconds: 3600, announce_evening: 1 },
    // A recurring chore made with no start: 0152 wrote its created_at as `at` (the date it
    // was always read from), so the fixture holds it the way production does now.
    { ...chore, id: id('C2aaaaaaa'), title: 'Vaisselle', recur_json: DAILY, created_at: now - 10 * 86400, at: now - 10 * 86400 },
    { ...chore, id: id('C3aaaaaaa'), title: 'Litière', recur_json: WEEKLY, at: UTC_TODAY - 9 * 86400, subject_kind: 'pet', subject_id: pet, icon: '🐱', effort: 2 },
    { ...chore, id: id('C4aaaaaaa'), title: 'Ranger le garage' },
    { ...chore, id: id('C5aaaaaaa'), title: 'Rendre les livres', at: D(1), rotation_json: JSON.stringify([m3]) },
    { ...chore, id: id('C6aaaaaaa'), title: 'Arroser', last_done_at: now - 60 },
    { ...chore, id: id('C7aaaaaaa'), title: 'Plier le linge', last_done_at: now - 600, cleared_at: now - 300 },
    { ...chore, id: id('C8aaaaaaa'), title: 'Laver l’auto', last_done_at: D(-1) + 100 },
    { ...chore, id: id('C9aaaaaaa'), title: 'Récurrence brisée', recur_json: '{"freq":"hourly"}' },
    { ...chore, id: id('CAaaaaaaa'), title: 'Gouttières', subject_kind: 'carnet', subject_id: carnet, effort: 5, colour: '#B06A93', recur_json: MONTHLY, at: UTC_TODAY - 40 * 86400 },
    { ...chore, id: id('CBaaaaaaa'), title: 'Bac bleu', recur_json: WEEKLY, at: D(-6), announce_evening: 1, rotation_json: JSON.stringify([m2, m3]), last_done_at: D(-7) + 100 },
    { ...chore, id: id('CCaaaaaaa'), title: 'Tondre', recur_json: WEEKLY, at: D(-7), last_done_at: now - 30 },
    { ...chore, id: id('CDaaaaaaa'), title: 'Dans trois jours', recur_json: WEEKLY, at: D(3) },
    // ── loose to-dos (the old `todos`): `at` is a local midnight, last_done_at the tick
    { ...todo, id: id('T1aaaaaaa'), title: 'Appeler la garderie', position: 0 },
    { ...todo, id: id('T2aaaaaaa'), title: 'Formulaire', at: today, member_id: m1, subject_kind: 'carnet', subject_id: carnet, icon: '📝', colour: '#5891AC', effort: 1, position: 1 },
    { ...todo, id: id('T3aaaaaaa'), title: 'Demain', at: D(1), position: 2 },
    { ...todo, id: id('T4aaaaaaa'), title: 'En retard', at: D(-3), member_id: m2, position: 3 },
    { ...todo, id: id('T5aaaaaaa'), title: 'Coché aujourd’hui', last_done_at: now - 120, position: 4 },
    { ...todo, id: id('T6aaaaaaa'), title: 'Coché hier', last_done_at: D(-1) + 50, position: 5 },
    { ...todo, id: id('T7aaaaaaa'), title: 'Daté coché', at: today, last_done_at: now - 30, position: 6 },
    { ...todo, id: id('T8aaaaaaa'), title: 'Passé coché', at: D(-2), last_done_at: D(-2) + 100, subject_kind: 'pet', subject_id: pet, position: 7 },
    { ...todo, id: id('T9aaaaaaa'), title: 'Le chien', subject_kind: 'pet', subject_id: pet, position: 8 },
    { ...todo, id: id('TAaaaaaaa'), title: 'Dans cinq jours', at: D(5), member_id: m3, position: 9 },
    // ── home rows (plan / upkeep)
    { ...home, id: id('H1aaaaaaa'), kind: 'plan', title: 'Rénover la cuisine', notes: 'trois devis', budget_cents: 1_500_000 },
    { ...home, id: id('H2aaaaaaa'), kind: 'plan', title: 'Peinturer', at: UTC_TODAY + 3 * 86400 },
    { ...home, id: id('H3aaaaaaa'), kind: 'upkeep', title: 'Filtre', at: UTC_TODAY - 90 * 86400, recur_json: MONTHLY, last_done_at: D(-5) },
    { ...home, id: id('H4aaaaaaa'), kind: 'upkeep', title: 'Ramonage', at: UTC_TODAY - 400 * 86400, recur_json: MONTHLY, recur_from: 'done', last_done_at: D(-20) },
    { ...home, id: id('H5aaaaaaa'), kind: 'upkeep', title: 'Pneus', at: UTC_TODAY - 30 * 86400, recur_json: WEEKLY, snoozed_until: D(3) },
    { ...home, id: id('H6aaaaaaa'), kind: 'upkeep', title: 'Thermopompe', at: UTC_TODAY - 14 * 86400, recur_json: WEEKLY, carnet_id: carnet, rotation_json: JSON.stringify([m1, m2]), current_idx: 1, icon: '❄️', effort: 3, lead_seconds: 86400, last_done_at: D(-7), last_done_by: m2 },
    { ...home, id: id('H7aaaaaaa'), kind: 'plan', title: 'Coché aujourd’hui', at: today, last_done_at: now - 50 },
    { ...home, id: id('H8aaaaaaa'), kind: 'plan', title: 'Sous le projet', subject_kind: 'project', subject_id: id('H1aaaaaaa'), colour: null },
    { ...home, id: id('H9aaaaaaa'), kind: 'upkeep', title: 'Vaccin de Léa', subject_kind: 'person', subject_id: m3, at: UTC_TODAY - 300 * 86400, recur_json: YEARLY },
    { ...home, id: id('HAaaaaaaa'), kind: 'plan', title: 'Projet en retard', at: D(-4) },
    { ...home, id: id('HBaaaaaaa'), kind: 'upkeep', title: 'Entretien du jour', at: D(-14), recur_json: WEEKLY, lead_seconds: 7200 },
    { ...home, id: id('HCaaaaaaa'), kind: 'plan', title: 'Plan sans date coché', last_done_at: now - 40, last_done_by: m1 },
  ])
  await insertRows('task_participants', [
    { id: id('P1aaaaaaa'), task_id: id('C1aaaaaaa'), member_id: m1, role: 'parent', contributed_at: D(-1) + 3600 },
    { id: id('P2aaaaaaa'), task_id: id('C1aaaaaaa'), member_id: m3, role: 'child', contributed_at: now - 120 },
    { id: id('P3aaaaaaa'), task_id: id('C6aaaaaaa'), member_id: null, role: 'parent', contributed_at: now - 60 },
    { id: id('P4aaaaaaa'), task_id: id('C3aaaaaaa'), member_id: m2, role: 'parent', contributed_at: D(-20) },
    { id: id('P5aaaaaaa'), task_id: id('CCaaaaaaa'), member_id: m2, role: 'parent', contributed_at: now - 30 },
  ])
  const tbase = { household_id: hh, created_at: now - 5 * 86400, updated_at: now - 5 * 86400 }
  await insertRows('todos', [
    { ...tbase, id: id('D1aaaaaaa'), title: 'Clés', day: today, section: 'Avant de partir', source_template_id: 'tplReaders01', position: 0 },
    { ...tbase, id: id('D2aaaaaaa'), title: 'Gourdes', day: today, section: 'Avant de partir', source_template_id: 'tplReaders01', position: 1, done_at: now - 10 },
    { ...tbase, id: id('D3aaaaaaa'), title: 'Manteaux', day: D(1), section: 'Avant de partir', source_template_id: 'tplReaders01', position: 2 },
    { ...tbase, id: id('D4aaaaaaa'), title: 'Lunettes', day: today, section: 'Partir', source_template_id: 'departure-adhoc', position: 0 },
    { ...tbase, id: id('D5aaaaaaa'), title: 'Vieille liste', section: 'Liste', position: 0 },
  ])
  return {
    s,
    labels,
    today,
    now,
    subjects: [
      { kind: 'carnet', id: carnet },
      { kind: 'pet', id: pet },
      { kind: 'person', id: m3 },
      { kind: 'project', id: id('H1aaaaaaa') },
    ],
  }
}

// Labels in place of minted ids, so the snapshot holds what a household reads, not what a
// random generator drew this run.
function scrub(f: Fixture, x: unknown): unknown {
  let json = JSON.stringify(x)
  for (const [raw, label] of f.labels) json = json.split(raw).join(label)
  return JSON.parse(json)
}

const fixtures = new Map<string, Fixture>()

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  for (const [tag, instant] of Object.entries(INSTANTS)) fixtures.set(tag, await build(tag, instant))
}, 120_000)

afterAll(() => {
  vi.useRealTimers()
})

for (const [tag, instant] of Object.entries(INSTANTS)) {
  describe(`every task reader, ${tag}`, () => {
    const f = () => fixtures.get(tag)!
    const read = async (path: string) => {
      vi.setSystemTime(new Date(instant))
      return scrub(f(), await okJson(f().s.fetch(path)))
    }

    it('the canary: the fixture holds every face, open and ticked', async () => {
      const kinds = await env.DB.prepare('SELECT kind, COUNT(*) AS n FROM home_projects WHERE household_id = ? GROUP BY kind ORDER BY kind').bind(f().s.householdId).all()
      expect(kinds.results).toEqual([
        { kind: 'chore', n: 13 },
        { kind: 'plan', n: 6 },
        { kind: 'todo', n: 10 },
        { kind: 'upkeep', n: 6 },
      ])
    })

    it('/api/board', async () => {
      expect(await read('/api/board')).toMatchSnapshot()
    })

    it('/api/tasks, and each subject’s history', async () => {
      expect(await read('/api/tasks')).toMatchSnapshot()
      for (const ref of f().subjects) expect(await read(`/api/tasks?subject=${ref.kind}:${ref.id}`), ref.kind).toMatchSnapshot()
    })

    it('the three aliases', async () => {
      expect(await read('/api/chores')).toMatchSnapshot()
      expect(await read('/api/home-projects')).toMatchSnapshot()
      expect(await read('/api/todos')).toMatchSnapshot()
      for (const n of [-3, 0, 1]) expect(await read(`/api/todos?date=${addLocalDays(f().today, n)}`), `todos ${n}`).toMatchSnapshot()
    })

    it('the calendar: a month, one day (the day page reads this), the year', async () => {
      const t = f().today
      expect(await read(`/api/month?from=${addLocalDays(t, -40)}&to=${addLocalDays(t, 40)}`)).toMatchSnapshot()
      for (const n of [-1, 0, 1, 3]) expect(await read(`/api/month?from=${addLocalDays(t, n)}&to=${addLocalDays(t, n + 1)}`), `day ${n}`).toMatchSnapshot()
      expect(await read(`/api/year?from=${addLocalDays(t, -30)}&to=${addLocalDays(t, 400)}`)).toMatchSnapshot()
    })

    it('the ledger and « Cette semaine »', async () => {
      expect(await read('/api/chores-ledger')).toMatchSnapshot()
      expect(await read('/api/this-week')).toMatchSnapshot()
    })

    it('the weekly recap’s « done this week » (it needs a model, so its read is pinned directly)', async () => {
      expect(await recapTaskTitles(env.DB, f().s.householdId, addLocalDays(f().today, -7))).toMatchSnapshot()
    })

    // ── The decided rules (2026-11-08, « align every view »), written before the snapshot moved.
    describe('the decided rules', () => {
      const t = () => f().today
      const tid = (x: string) => `${tag.slice(0, 3)}${x}`
      const month = () => read(`/api/month?from=${addLocalDays(t(), -40)}&to=${addLocalDays(t(), 40)}`) as Promise<MonthWire>

      it('every dated task gets a calendar cell: a dated one-off chore now has one', async () => {
        const m = await month()
        expect(m.tasks.some((c) => c.taskId === tid('C5aaaaaaa')), 'Rendre les livres').toBe(true)
      })
      it('a ticked one-off keeps its cell, struck: a ticked dated to-do now has one, `done`', async () => {
        const m = await month()
        expect(m.tasks.find((c) => c.taskId === tid('T7aaaaaaa'))?.done, 'Daté coché').toBe(true)
        expect(m.tasks.find((c) => c.taskId === tid('H7aaaaaaa'))?.done, 'a ticked plan, as before').toBe(true)
        expect(m.tasks.find((c) => c.taskId === tid('T3aaaaaaa'))?.done, 'an open one is not struck').toBe(false)
      })
      it('the departure checklists keep their own marker; a loose to-do is a task cell, never both', async () => {
        const m = await month()
        expect(m.todos.every((x) => x.section != null)).toBe(true)
        expect(m.todos.some((x) => x.id === tid('T3aaaaaaa'))).toBe(false)
      })
      it('the year shows every dated task: a chore and a to-do', async () => {
        const y = (await read(`/api/year?from=${addLocalDays(t(), -30)}&to=${addLocalDays(t(), 400)}`)) as YearWire
        expect(y.tasks.some((c) => c.id.startsWith(tid('C1aaaaaaa'))), 'Sortir les poubelles').toBe(true)
        expect(y.tasks.some((c) => c.id === tid('TAaaaaaaa')), 'Dans cinq jours').toBe(true)
      })
      it('the board: one list for the card (the to-dos due today included) and one for « À venir »', async () => {
        const b = (await read('/api/board')) as BoardWire
        expect(b.tasks.some((x) => x.id === tid('T2aaaaaaa')), 'a to-do due today rides the board').toBe(true)
        expect(b.tasks.find((x) => x.id === tid('T4aaaaaaa'))?.overdueSince, 'an owed to-do is carried forward').not.toBeNull()
        expect(b.tasks.find((x) => x.id === tid('C3aaaaaaa'))?.overdueSince, 'an owed chore is carried forward').not.toBeNull()
        expect(b.tasksAhead.some((x) => x.id === tid('TAaaaaaaa')), 'a to-do in five days is « À venir »').toBe(true)
        expect(b.tasksAhead.every((x) => x.done === 'open' && !x.dueToday)).toBe(true)
      })
      it('the recap hears every task done this week: a to-do and a project, not only chores', async () => {
        const titles = await recapTaskTitles(env.DB, f().s.householdId, addLocalDays(t(), -7))
        expect(titles).toContain('Coché aujourd’hui')
        expect(titles).toContain('Plan sans date coché')
        expect(titles).toContain('Sortir les poubelles')
      })
      it('the assistant hears every open task: a to-do and a project, never a ticked one-off', async () => {
        vi.setSystemTime(new Date(instant))
        const snap = (await gatherAskSnapshot(env as unknown as Env, f().s.householdId, t())) as unknown as { chores: { title: string }[] }
        const titles = snap.chores.map((c) => c.title)
        expect(titles).toContain('Appeler la garderie')
        expect(titles).toContain('Rénover la cuisine')
        expect(titles).not.toContain('Arroser')
      })
      it('« Sur quoi ? » offers the projects, and only them: kind plan', async () => {
        const all = (await read('/api/tasks')) as TasksWire
        expect(all.subjects.projects.map((p) => p.title)).toContain('Rénover la cuisine')
        expect(all.subjects.projects.map((p) => p.title)).not.toContain('Appeler la garderie')
      })
    })

    it('what the house assistant is told', async () => {
      vi.setSystemTime(new Date(instant))
      const snap = await gatherAskSnapshot(env as unknown as Env, f().s.householdId, f().today)
      expect(scrub(f(), (snap as unknown as { chores?: unknown }).chores ?? snap)).toMatchSnapshot()
    })
  })
}
