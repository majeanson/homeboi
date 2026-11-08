import { describe, it, expect, beforeAll } from 'vitest'
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'
import { HOME_TASK_COLS, choreTask, homeTask, present, todoTask, type ChoreTaskRow, type HomeTaskRow, type TodoTaskRow } from '../functions/_lib/taskItem'
import { upkeepStatus } from '../functions/_lib/upkeep'
import { freshIdMap, idsIn } from '../functions/_lib/restore'
import type { Takeout } from '../functions/_lib/takeout'
import type { BoardWire, TaskItem, TasksWire, TodosWire } from '../functions/_lib/wire'
import PREMERGE from '../functions/test/fixtures/taskMerge.premerge-sample.json'

// THE MERGE DRILL (0150). The owner's household data is on the line, so the migration is not
// trusted on review: it is RUN, here, on households built in the shape that exists today, and
// everything a reader returns is compared before and after.
//
// HOW. The harness migrates the Worker's database all the way, so the pre-merge shape cannot
// live there. A second database (DRILL_DB, vitest.d1.config.ts) is migrated only up to 0149,
// seeded in the OLD shape, read with the OLD queries (frozen below, copied verbatim from the
// code before the merge), handed the 0150 migration itself, and read again:
//   · ROW LEVEL, in the drill database: counts per household, every id, the departure rows.
//   · HANDLER LEVEL: the migrated rows are copied into the Worker's database under a real
//     signed-in household, and the REAL endpoints answer. Before the merge each TaskItem came
//     from the pure functions in _lib/taskItem over the old rows (exactly what the old
//     /api/tasks and /api/board did), so those same functions over the frozen old queries ARE
//     the « before ». The pure functions did not change in the merge; only their SQL did.
// Two households: one hand-built with every variety the plan names (NULL in every optional
// column, recurring with rotation and ledger lines, overdue, ticked today, ticked earlier,
// cleared, malformed recurrence, subjects of every kind, departure instances, the ad-hoc
// sentinel, a legacy sectioned row, home rows of every kind) and the REAL sample seed as
// captured from the pre-merge code (functions/test/fixtures/taskMerge.premerge-sample.json,
// two chores ticked and one to-do ticked through the old endpoints before the capture).
// Then the safety net: that same pre-merge copy restored into a third household, through
// POST /api/takeout/restore, read back through /api/tasks.

const DRILL = env.DRILL_DB
const now = Math.floor(Date.now() / 1000)
const today = localDayStart(new Date(now * 1000))
const D = (n: number) => addLocalDays(today, n)
const UTC_TODAY = Math.floor(Date.UTC(new Date(now * 1000).getUTCFullYear(), new Date(now * 1000).getUTCMonth(), new Date(now * 1000).getUTCDate()) / 1000)
const WEEKLY = JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [] })
const DAILY = JSON.stringify({ freq: 'daily', interval: 1 })
const MONTHLY = JSON.stringify({ freq: 'monthly', interval: 1 })

type Row = Record<string, unknown>

// ── The OLD readers, verbatim from the code before 0150 ───────────────────────────────────
const OLD_CHORE_COLS =
  'id, title, colour AS color, rotation_json, current_idx, last_done_at, cleared_at, recur_json, recur_start, lead_seconds, subject_kind, subject_id, icon, effort, created_at'
const OLD = {
  tasksChores: `SELECT ${OLD_CHORE_COLS} FROM tasks WHERE household_id = ? ORDER BY created_at LIMIT 500`,
  tasksHomes: `SELECT ${HOME_TASK_COLS} FROM home_projects WHERE household_id = ? ORDER BY created_at LIMIT 500`,
  tasksTodos:
    'SELECT id, title, day, member_id, done_at, section, source_template_id, subject_kind, subject_id, icon, colour AS color, effort FROM todos WHERE household_id = ? AND source_template_id IS NULL AND section IS NULL AND (done_at IS NULL OR done_at >= ?) ORDER BY created_at, position LIMIT 500',
  boardChores: `SELECT ${OLD_CHORE_COLS}, announce_evening FROM tasks WHERE household_id = ? ORDER BY created_at`,
  boardHomes: `SELECT ${HOME_TASK_COLS} FROM home_projects WHERE household_id = ? AND (at IS NOT NULL OR last_done_at >= ?)`,
  choresGet:
    'SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by, colour AS color, recur_json, recur_start, lead_seconds, announce_evening, subject_kind, subject_id, icon, effort FROM tasks WHERE household_id = ? ORDER BY created_at',
  homeGet:
    'SELECT id, kind, title, notes, budget_cents, colour AS color, at, recur_json, recur_from, lead_seconds, last_done_at, snoozed_until, carnet_id, subject_kind, subject_id, rotation_json, current_idx, last_done_by, icon, effort FROM home_projects WHERE household_id = ? ORDER BY created_at',
  todosDay:
    'SELECT id, title, day, member_id, done_at, position, section, source_template_id, created_at, subject_kind, subject_id, icon, colour AS color, effort FROM todos WHERE household_id = ? AND day = ? ORDER BY created_at, position',
  todosGlance: `SELECT id, title, day, member_id, done_at, position, section, source_template_id, created_at, subject_kind, subject_id, icon, colour AS color, effort FROM todos
         WHERE household_id = ?
           AND (day IS NULL
                OR day = ?
                OR (day < ? AND day IS NOT NULL AND source_template_id IS NULL AND done_at IS NULL))
           AND NOT (day IS NULL AND done_at IS NOT NULL AND done_at < ? AND source_template_id IS NULL AND section IS NULL)
         ORDER BY created_at, position`,
  monthChores: 'SELECT id, title, colour AS color, rotation_json, current_idx, last_done_at, recur_json, recur_start, created_at FROM tasks WHERE household_id = ?',
  monthTodos: 'SELECT id, title, member_id, day, section FROM todos WHERE household_id = ? AND day IS NOT NULL AND day >= ? AND day < ? AND done_at IS NULL ORDER BY day, position, created_at',
  monthHomes: 'SELECT id, kind, title, colour AS color, at, recur_json, recur_from, last_done_at FROM home_projects WHERE household_id = ? AND at IS NOT NULL',
  ledger: `SELECT tp.task_id, tp.role, tp.contributed_at, tp.member_id AS member_id, t.title AS chore_title, t.colour AS chore_color
       FROM task_participants tp JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
      WHERE tp.contributed_at >= ? ORDER BY tp.contributed_at DESC, tp.id`,
  recap: 'SELECT title FROM tasks WHERE household_id = ? AND last_done_at >= ? LIMIT 20',
  ask: 'SELECT title FROM tasks WHERE household_id = ? ORDER BY created_at LIMIT 30',
  departures: 'SELECT * FROM todos WHERE household_id = ? AND (source_template_id IS NOT NULL OR section IS NOT NULL) ORDER BY id',
}
// The old /api/tasks historyOf, verbatim: a chore's log, a home row's last time, a to-do whose
// day has passed.
async function oldHistory(hh: string, ref: { kind: string; id: string }) {
  type L = { id: string; title: string; at: number; who_id: string | null }
  const homeMatch = ref.kind === 'carnet' ? 'carnet_id = ?' : 'subject_kind = ? AND subject_id = ?'
  const homeBinds = ref.kind === 'carnet' ? [ref.id] : [ref.kind, ref.id]
  const chores = await all<L>(
    DRILL,
    `SELECT t.id, t.title, tp.contributed_at AS at, tp.member_id AS who_id
           FROM task_participants tp
           JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
          WHERE t.subject_kind = ? AND t.subject_id = ?
          ORDER BY tp.contributed_at DESC LIMIT ?`,
    hh,
    ref.kind,
    ref.id,
    30,
  )
  const homes = await all<L>(DRILL, `SELECT id, title, last_done_at AS at, last_done_by AS who_id FROM home_projects WHERE household_id = ? AND last_done_at IS NOT NULL AND ${homeMatch} ORDER BY last_done_at DESC LIMIT ?`, hh, ...homeBinds, 30)
  const todos = await all<L>(
    DRILL,
    'SELECT id, title, done_at AS at, member_id AS who_id FROM todos WHERE household_id = ? AND subject_kind = ? AND subject_id = ? AND done_at IS NOT NULL AND done_at < ? ORDER BY done_at DESC LIMIT ?',
    hh,
    ref.kind,
    ref.id,
    today,
    30,
  )
  const line = (src: string) => (r: L) => ({ key: `${src}:${r.id}:${r.at}`, title: r.title, at: r.at, who_id: r.who_id })
  return [...chores.map(line('chore')), ...homes.map(line('home')), ...todos.map(line('todo'))].sort((a, b) => b.at - a.at).slice(0, 30)
}

// The NEW month and ledger reads (the handler's SQL, copied: their derivations are unchanged
// code, so equal rows mean equal cells). The others are compared through the real endpoints.
const NEW = {
  monthChores: "SELECT id, title, colour AS color, rotation_json, current_idx, last_done_at, recur_json, at AS recur_start, created_at FROM home_projects WHERE household_id = ? AND kind = 'chore'",
  monthHomes: "SELECT id, kind, title, colour AS color, at, recur_json, recur_from, last_done_at FROM home_projects WHERE household_id = ? AND kind IN ('plan', 'upkeep') AND at IS NOT NULL",
  ledger: `SELECT tp.task_id, tp.role, tp.contributed_at, tp.member_id AS member_id, t.title AS chore_title, t.colour AS chore_color
       FROM task_participants tp JOIN home_projects t ON t.id = tp.task_id AND t.household_id = ?
      WHERE tp.contributed_at >= ? ORDER BY tp.contributed_at DESC, tp.id`,
}
const MONTH_FROM = D(-40)
const MONTH_TO = D(40)

const all = async <T = Row>(db: D1Database, sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).all<T>()).results
const byKey = (xs: TaskItem[]) => [...xs].sort((a, b) => a.key.localeCompare(b.key))
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))

async function insertRows(db: D1Database, table: string, rows: Row[]) {
  const stmts = rows.map((r) => {
    const keys = Object.keys(r)
    return db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => r[k] ?? null))
  })
  for (let i = 0; i < stmts.length; i += 40) if (stmts.length) await db.batch(stmts.slice(i, i + 40))
}

// Everything the old code answered, for one household.
async function before(hh: string) {
  const [chores, homes, todos] = await Promise.all([
    all<ChoreTaskRow>(DRILL, OLD.tasksChores, hh),
    all<HomeTaskRow>(DRILL, OLD.tasksHomes, hh),
    all<TodoTaskRow>(DRILL, OLD.tasksTodos, hh, today),
  ])
  const boardChores = await all<ChoreTaskRow & { announce_evening: number | null }>(DRILL, OLD.boardChores, hh)
  const boardHomes = await all<HomeTaskRow>(DRILL, OLD.boardHomes, hh, today)
  return {
    tasks: [...homes.map((h) => homeTask(h, today, now)), ...chores.map((c) => choreTask(c, today, now)), ...todos.map((t) => todoTask(t, today))].filter(present),
    boardTasks: [...boardHomes.map((h) => homeTask(h, today, now)), ...boardChores.map((c) => choreTask(c, today, now))].filter(present).filter((i) => i.onBoard),
    boardChores,
    choresGet: await all(DRILL, OLD.choresGet, hh),
    homeGet: (await all<HomeTaskRow & Row>(DRILL, OLD.homeGet, hh)).map((p) => ({ ...p, ...upkeepStatus(p, today) })),
    todosGlance: await all(DRILL, OLD.todosGlance, hh, today, today, today),
    todosDays: await Promise.all([D(-3), today, D(1)].map((d) => all(DRILL, OLD.todosDay, hh, d))),
    monthChores: await all(DRILL, OLD.monthChores, hh),
    monthTodos: await all(DRILL, OLD.monthTodos, hh, MONTH_FROM, MONTH_TO),
    monthHomes: await all(DRILL, OLD.monthHomes, hh),
    ledger: await all(DRILL, OLD.ledger, hh, D(-366)),
    recap: await all(DRILL, OLD.recap, hh, D(-7)),
    ask: await all(DRILL, OLD.ask, hh),
    departures: await all(DRILL, OLD.departures, hh),
    counts: {
      chores: (await all(DRILL, 'SELECT id FROM tasks WHERE household_id = ?', hh)).length,
      loose: (await all(DRILL, 'SELECT id FROM todos WHERE household_id = ? AND source_template_id IS NULL AND section IS NULL', hh)).length,
      departures: (await all(DRILL, 'SELECT id FROM todos WHERE household_id = ? AND (source_template_id IS NOT NULL OR section IS NOT NULL)', hh)).length,
      homes: (await all(DRILL, 'SELECT id FROM home_projects WHERE household_id = ?', hh)).length,
      lines: (await all(DRILL, 'SELECT tp.id FROM task_participants tp JOIN tasks t ON t.id = tp.task_id WHERE t.household_id = ?', hh)).length,
    },
    ids: {
      chores: (await all<{ id: string }>(DRILL, 'SELECT id FROM tasks WHERE household_id = ? ORDER BY id', hh)).map((r) => r.id),
      loose: (await all<{ id: string }>(DRILL, 'SELECT id FROM todos WHERE household_id = ? AND source_template_id IS NULL AND section IS NULL ORDER BY id', hh)).map((r) => r.id),
      homes: (await all<{ id: string }>(DRILL, 'SELECT id FROM home_projects WHERE household_id = ? ORDER BY id', hh)).map((r) => r.id),
    },
  }
}

// ── The two pre-merge households ──────────────────────────────────────────────────────────
interface Drilled {
  s: Session
  before: Awaited<ReturnType<typeof before>>
  subjects: { kind: string; id: string }[]
  history: Map<string, Awaited<ReturnType<typeof oldHistory>>>
}
let built: Drilled
let sample: Drilled & { map: Map<string, string> }
let restored: Session & { password: string }

const MIGRATIONS = env.TEST_MIGRATIONS
const MERGE = MIGRATIONS.filter((m) => m.name.startsWith('0150_'))

async function copyHousehold(s: Session) {
  const hh = await env.DB.prepare('SELECT * FROM households WHERE id = ?').bind(s.householdId).first<Row>()
  await insertRows(DRILL, 'households', [hh!])
}

// One hand-built household with every variety the plan names.
async function buildVariety(s: Session) {
  const hh = s.householdId
  const mk = async (name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
  const [m1, m2, m3] = [await mk('Maman'), await mk('Papa'), await mk('Léa')]
  const carnet = (await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'La maison', kind: 'home' } }))).id
  const pet = (await okJson<{ id: string }>(s.fetch('/api/pets', { method: 'POST', body: { name: 'Biscuit' } }))).id
  await copyHousehold(s)
  for (const t of ['members', 'carnets', 'pets']) await insertRows(DRILL, t, await all(env.DB, `SELECT * FROM ${t} WHERE household_id = ?`, hh))

  const base = { household_id: hh, created_at: now - 30 * 86400 }
  const chores: Row[] = [
    // recurring, rotation, lead, evening, ticked yesterday
    { ...base, id: 'drillC1aaaaa', title: 'Sortir les poubelles', rotation_json: JSON.stringify([m1, m2]), current_idx: 1, last_done_at: D(-1) + 3600, last_done_by: m1, colour: '#88A36F', recur_json: WEEKLY, recur_start: UTC_TODAY - 7 * 86400, lead_seconds: 3600, announce_evening: 1 },
    // recurring with NO start (pre-0032): anchors at created_at; every optional column NULL
    { ...base, id: 'drillC2aaaaa', title: 'Vaisselle', recur_json: DAILY, created_at: now - 10 * 86400 },
    // recurring, overdue, subject pet, icon, effort
    { ...base, id: 'drillC3aaaaa', title: 'Litière', recur_json: WEEKLY, recur_start: UTC_TODAY - 9 * 86400, subject_kind: 'pet', subject_id: pet, icon: '🐱', effort: 2 },
    // one-off undated, never done, NULL everything
    { ...base, id: 'drillC4aaaaa', title: 'Ranger le garage' },
    // one-off dated tomorrow, one person
    { ...base, id: 'drillC5aaaaa', title: 'Rendre les livres', recur_start: D(1), rotation_json: JSON.stringify([m3]) },
    // one-off ticked today
    { ...base, id: 'drillC6aaaaa', title: 'Arroser', last_done_at: now - 60, last_done_by: null },
    // one-off ticked today, then « Vider les cochés »
    { ...base, id: 'drillC7aaaaa', title: 'Plier le linge', last_done_at: now - 600, cleared_at: now - 300 },
    // one-off ticked yesterday: cleared by the day
    { ...base, id: 'drillC8aaaaa', title: 'Laver l’auto', last_done_at: D(-1) + 100 },
    // a malformed recurrence reads one-off
    { ...base, id: 'drillC9aaaaa', title: 'Recurrence brisée', recur_json: '{"freq":"hourly"}' },
    // subject carnet, colour, effort
    { ...base, id: 'drillCAaaaaa', title: 'Gouttières', subject_kind: 'carnet', subject_id: carnet, effort: 5, colour: '#B06A93', recur_json: MONTHLY, recur_start: UTC_TODAY - 40 * 86400 },
  ]
  // `colour` NOT NULL on `tasks`: the rows that leave it out get the column default.
  await insertRows(DRILL, 'tasks', chores)
  await insertRows(DRILL, 'task_participants', [
    { id: 'drillP1aaaaa', task_id: 'drillC1aaaaa', member_id: m1, role: 'parent', contributed_at: D(-1) + 3600 },
    { id: 'drillP2aaaaa', task_id: 'drillC1aaaaa', member_id: m3, role: 'child', contributed_at: now - 120 },
    { id: 'drillP3aaaaa', task_id: 'drillC6aaaaa', member_id: null, role: 'parent', contributed_at: now - 60 },
    { id: 'drillP4aaaaa', task_id: 'drillC3aaaaa', member_id: m2, role: 'parent', contributed_at: D(-20) },
  ])
  const tbase = { household_id: hh, created_at: now - 5 * 86400, updated_at: now - 5 * 86400 }
  await insertRows(DRILL, 'todos', [
    { ...tbase, id: 'drillT1aaaaa', title: 'Appeler la garderie', position: 0 },
    { ...tbase, id: 'drillT2aaaaa', title: 'Formulaire', day: today, member_id: m1, subject_kind: 'carnet', subject_id: carnet, icon: '📝', colour: '#5891AC', effort: 1, position: 1 },
    { ...tbase, id: 'drillT3aaaaa', title: 'Demain', day: D(1), position: 2 },
    { ...tbase, id: 'drillT4aaaaa', title: 'En retard', day: D(-3), member_id: m2, position: 3 },
    { ...tbase, id: 'drillT5aaaaa', title: 'Coché aujourd’hui', done_at: now - 120, position: 4 },
    { ...tbase, id: 'drillT6aaaaa', title: 'Coché hier', done_at: D(-1) + 50, position: 5 },
    { ...tbase, id: 'drillT7aaaaa', title: 'Daté coché', day: today, done_at: now - 30, position: 6 },
    { ...tbase, id: 'drillT8aaaaa', title: 'Passé coché', day: D(-2), done_at: D(-2) + 100, subject_kind: 'pet', subject_id: pet, position: 7 },
    { ...tbase, id: 'drillT9aaaaa', title: 'Le chien', subject_kind: 'pet', subject_id: pet, position: 8 },
    // departure instances, the ad-hoc sentinel, a legacy sectioned row: NOT tasks
    { ...tbase, id: 'drillD1aaaaa', title: 'Clés', day: today, section: 'Avant de partir', source_template_id: 'tplDrill0001', position: 0 },
    { ...tbase, id: 'drillD2aaaaa', title: 'Gourdes', day: today, section: 'Avant de partir', source_template_id: 'tplDrill0001', position: 1, done_at: now - 10 },
    { ...tbase, id: 'drillD3aaaaa', title: 'Manteaux', day: D(1), section: 'Avant de partir', source_template_id: 'tplDrill0001', position: 2 },
    { ...tbase, id: 'drillD4aaaaa', title: 'Lunettes', day: today, section: 'Partir', source_template_id: 'departure-adhoc', position: 0 },
    { ...tbase, id: 'drillD5aaaaa', title: 'Vieille liste', section: 'Liste', position: 0 },
  ])
  const hbase = { household_id: hh, created_at: now - 60 * 86400, updated_at: now - 60 * 86400 }
  await insertRows(DRILL, 'home_projects', [
    { ...hbase, id: 'drillH1aaaaa', kind: 'plan', title: 'Rénover la cuisine', notes: 'trois devis', budget_cents: 1_500_000 },
    { ...hbase, id: 'drillH2aaaaa', kind: 'plan', title: 'Peinturer', at: UTC_TODAY + 7 * 86400 },
    { ...hbase, id: 'drillH3aaaaa', kind: 'upkeep', title: 'Filtre', at: UTC_TODAY - 90 * 86400, recur_json: MONTHLY, last_done_at: D(-5) },
    { ...hbase, id: 'drillH4aaaaa', kind: 'upkeep', title: 'Ramonage', at: UTC_TODAY - 400 * 86400, recur_json: MONTHLY, recur_from: 'done', last_done_at: D(-20) },
    { ...hbase, id: 'drillH5aaaaa', kind: 'upkeep', title: 'Pneus', at: UTC_TODAY - 30 * 86400, recur_json: WEEKLY, snoozed_until: D(3) },
    { ...hbase, id: 'drillH6aaaaa', kind: 'upkeep', title: 'Thermopompe', at: UTC_TODAY - 14 * 86400, recur_json: WEEKLY, carnet_id: carnet, rotation_json: JSON.stringify([m1, m2]), current_idx: 1, icon: '❄️', effort: 3, lead_seconds: 86400, last_done_at: D(-7), last_done_by: m2 },
    { ...hbase, id: 'drillH7aaaaa', kind: 'plan', title: 'Coché aujourd’hui', at: today, last_done_at: now - 50 },
    { ...hbase, id: 'drillH8aaaaa', kind: 'plan', title: 'Sous le projet', subject_kind: 'project', subject_id: 'drillH1aaaaa' },
    { ...hbase, id: 'drillH9aaaaa', kind: 'upkeep', title: 'Vaccin de Léa', subject_kind: 'person', subject_id: m3, at: UTC_TODAY - 300 * 86400, recur_json: JSON.stringify({ freq: 'yearly', interval: 1 }) },
  ])
  return [
    { kind: 'carnet', id: carnet },
    { kind: 'pet', id: pet },
    { kind: 'person', id: m3 },
    { kind: 'project', id: 'drillH1aaaaa' },
  ]
}

// The REAL sample seed, as the pre-merge code wrote it, with fresh ids (the restore below uses
// the original ones) and repointed at a live household.
async function buildSample(s: Session): Promise<Map<string, string>> {
  const t = PREMERGE as unknown as Takeout
  const map = freshIdMap(idsIn(t).filter((id) => id !== t.householdId))
  const sub = (v: unknown) => (typeof v === 'string' ? v.replace(/[A-Za-z0-9]{8,32}/g, (tok) => (tok === t.householdId ? s.householdId : (map.get(tok) ?? tok))) : v)
  const fix = (rows: Row[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, sub(v)])))
  await copyHousehold(s)
  // Members and carnets live in the Worker's database too: the handlers resolve names and subjects.
  for (const name of ['members', 'carnets']) {
    await insertRows(DRILL, name, fix(t.tables[name] ?? []))
    await insertRows(env.DB, name, fix(t.tables[name] ?? []))
  }
  for (const name of ['tasks', 'task_participants', 'todos', 'home_projects']) await insertRows(DRILL, name, fix(t.tables[name] ?? []))
  return map
}

// The migrated rows, back into the Worker's database, where the real endpoints read them.
async function copyBack(hh: string) {
  await insertRows(env.DB, 'home_projects', await all(DRILL, 'SELECT * FROM home_projects WHERE household_id = ? ORDER BY rowid', hh))
  await insertRows(env.DB, 'task_participants', await all(DRILL, 'SELECT tp.* FROM task_participants tp JOIN home_projects t ON t.id = tp.task_id WHERE t.household_id = ? ORDER BY tp.rowid', hh))
  await insertRows(env.DB, 'todos', await all(DRILL, 'SELECT * FROM todos WHERE household_id = ? ORDER BY rowid', hh))
}

beforeAll(async () => {
  expect(MERGE, 'the merge migration is on disk').toHaveLength(1)
  await applyD1Migrations(DRILL, MIGRATIONS.filter((m) => m.name < '0150_'))
  expect(await DRILL.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").first(), 'the drill starts in the pre-merge shape').not.toBeNull()

  const s1 = await household('drill-variety', undefined, { empty: true })
  const subjects = await buildVariety(s1)
  const s2 = await household('drill-sample', undefined, { empty: true })
  const map = await buildSample(s2)
  const history = new Map<string, Awaited<ReturnType<typeof oldHistory>>>()
  for (const ref of subjects) history.set(`${ref.kind}:${ref.id}`, await oldHistory(s1.householdId, ref))
  built = { s: s1, before: await before(s1.householdId), subjects, history }
  sample = { s: s2, before: await before(s2.householdId), subjects: [], history: new Map(), map }

  // THE MIGRATION, as wrangler would apply it.
  await applyD1Migrations(DRILL, MERGE)
  await copyBack(s1.householdId)
  await copyBack(s2.householdId)

  restored = await household('drill-restore', undefined, { empty: true })
}, 120_000)

describe('the merge, run on pre-merge households', () => {
  it('the drill household is the variety the plan asks for (canary: an empty seed proves nothing)', () => {
    expect(built.before.counts).toEqual({ chores: 10, loose: 9, departures: 5, homes: 9, lines: 4 })
    expect(sample.before.counts.chores).toBe(8)
    expect(sample.before.counts.loose).toBe(8)
    expect(sample.before.counts.lines).toBe(2)
    // A NULL-predicate slip once hid every open to-do: the before must hold open ones to lose.
    expect(built.before.tasks.filter((x) => x.source === 'todo' && x.done === 'open').length).toBeGreaterThanOrEqual(5)
  })

  for (const which of ['variety', 'sample'] as const) {
    describe(which, () => {
      const d = () => (which === 'variety' ? built : sample)
      const hh = () => d().s.householdId

      it('row counts are conserved per face, every id is where it was, and the old table is gone', async () => {
        const b = d().before
        const ids = async (kind: string) => (await all<{ id: string }>(DRILL, `SELECT id FROM home_projects WHERE household_id = ? AND kind ${kind} ORDER BY id`, hh())).map((r) => r.id)
        expect(await ids("= 'chore'")).toEqual(b.ids.chores)
        expect(await ids("= 'todo'")).toEqual(b.ids.loose)
        expect(await ids("IN ('plan', 'upkeep')")).toEqual(b.ids.homes)
        expect((await all(DRILL, 'SELECT id FROM todos WHERE household_id = ?', hh())).length, 'only the departure rows stay in todos').toBe(b.counts.departures)
        expect((await all(DRILL, 'SELECT tp.id FROM task_participants tp JOIN home_projects t ON t.id = tp.task_id WHERE t.household_id = ?', hh())).length).toBe(b.counts.lines)
        expect(await DRILL.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").first()).toBeNull()
      })

      it('the departure instances are untouched, column for column', async () => {
        expect(await all(DRILL, OLD.departures, hh())).toEqual(d().before.departures)
      })

      it('every TaskItem on /api/tasks is identical: title, day, next date, done, who, team, subject, look, effort, recurring', async () => {
        const got = await okJson<TasksWire>(d().s.fetch('/api/tasks'))
        expect(byKey(got.tasks)).toEqual(byKey(d().before.tasks))
      })

      it('the board: its tasks, and its chore rows, are identical', async () => {
        const got = await okJson<BoardWire>(d().s.fetch('/api/board'))
        expect(byKey(got.tasks)).toEqual(byKey(d().before.boardTasks))
        const shape = (c: Row) => ({
          id: c.id,
          title: c.title,
          rotation_json: c.rotation_json,
          current_idx: c.current_idx,
          last_done_at: c.last_done_at,
          color: c.color,
          recur_json: c.recur_json,
          recur_start: c.recur_start,
          lead_seconds: c.lead_seconds,
          announce_evening: c.announce_evening,
          created_at: c.created_at,
        })
        expect(byId(got.chores.map((c) => shape(c as unknown as Row)) as { id: string }[])).toEqual(byId(d().before.boardChores.map((c) => shape(c as unknown as Row)) as { id: string }[]))
      })

      it('the three alias GETs answer what they answered', async () => {
        const chores = await okJson<{ chores: Row[] }>(d().s.fetch('/api/chores'))
        expect(byId(chores.chores as { id: string }[])).toEqual(byId(d().before.choresGet as { id: string }[]))
        const homes = await okJson<{ projects: Row[] }>(d().s.fetch('/api/home-projects'))
        expect(byId(homes.projects as { id: string }[])).toEqual(byId(d().before.homeGet as unknown as { id: string }[]))
        const glance = await okJson<TodosWire>(d().s.fetch('/api/todos'))
        expect(byId(glance.todos)).toEqual(byId(d().before.todosGlance as TodosWire['todos']))
        const days = [D(-3), today, D(1)]
        for (const [i, day] of days.entries()) {
          const got = await okJson<TodosWire>(d().s.fetch(`/api/todos?date=${day}`))
          expect(byId(got.todos), `todos?date=${day}`).toEqual(byId(d().before.todosDays[i] as TodosWire['todos']))
        }
      })

      it('the calendar reads the same rows (month, then the endpoint answers)', async () => {
        expect(byId(await all<{ id: string }>(env.DB, NEW.monthChores, hh()))).toEqual(byId(d().before.monthChores as { id: string }[]))
        expect(byId(await all<{ id: string }>(env.DB, NEW.monthHomes, hh()))).toEqual(byId(d().before.monthHomes as { id: string }[]))
        const month = await okJson<{ todos: { id: string; title: string; member_id: string | null; day: number; section: string | null }[] }>(
          d().s.fetch(`/api/month?from=${MONTH_FROM}&to=${MONTH_TO}`),
        )
        // The to-do cells are the rows themselves: compare them whole.
        expect(byId(month.todos)).toEqual(byId(d().before.monthTodos as { id: string; title: string; member_id: string | null; day: number; section: string | null }[]))
      })

      it('the ledger’s history is identical, and so are the recap’s and the house’s titles', async () => {
        expect(await all(env.DB, NEW.ledger, hh(), D(-366))).toEqual(d().before.ledger)
        expect((await d().s.fetch('/api/chores-ledger')).status).toBe(200)
        expect(await all(env.DB, "SELECT title FROM home_projects WHERE household_id = ? AND kind = 'chore' AND last_done_at >= ? LIMIT 20", hh(), D(-7))).toEqual(d().before.recap)
        expect(await all(env.DB, "SELECT title FROM home_projects WHERE household_id = ? AND kind = 'chore' ORDER BY created_at LIMIT 30", hh())).toEqual(d().before.ask)
      })
    })
  }

  it('a subject’s history is identical: the old three queries on the old rows, then the endpoint', async () => {
    for (const ref of built.subjects) {
      const got = await okJson<TasksWire>(built.s.fetch(`/api/tasks?subject=${ref.kind}:${ref.id}`))
      expect(got.history, `${ref.kind} history`).toEqual(built.history.get(`${ref.kind}:${ref.id}`))
    }
    // …and it is not vacuous: the subjects have lines from all three old tables between them.
    const lines = [...built.history.values()].flat()
    expect(new Set(lines.map((l) => l.key.split(':')[0]))).toEqual(new Set(['chore', 'home', 'todo']))
  })

  it('NULL is never a lie: the open to-dos with NULL day, NULL member, NULL look read open, the cleared ones stay gone', async () => {
    const items = (await okJson<TodosWire>(built.s.fetch('/api/todos'))).items
    const open = items.filter((i) => i.done === 'open').map((i) => i.id).sort()
    expect(open).toEqual(['drillT1aaaaa', 'drillT2aaaaa', 'drillT4aaaaa', 'drillT9aaaaa'])
    expect(items.map((i) => i.id)).not.toContain('drillT6aaaaa')
    const tasks = (await okJson<TasksWire>(built.s.fetch('/api/tasks'))).tasks
    const by = (id: string) => tasks.find((t) => t.id === id)
    expect(by('drillT1aaaaa')).toMatchObject({ source: 'todo', done: 'open', day: null, color: null, icon: null, effort: null, subject: null, who_id: null })
    expect(by('drillC2aaaaa')).toMatchObject({ source: 'chore', recurring: true, done: 'open' })
    expect(by('drillC4aaaaa')).toMatchObject({ source: 'chore', day: null, overdueSince: null, done: 'open' })
    expect(by('drillC7aaaaa'), 'cleared today stays cleared').toBeUndefined()
    expect(by('drillC9aaaaa'), 'a malformed recurrence still reads one-off').toMatchObject({ recurring: false, day: null })
    expect(by('drillC3aaaaa')?.overdueSince, 'an overdue chore is still owed').not.toBeNull()
  })

  it('the migrated rows keep working through the aliases: a tick logs, an untick takes it back, a to-do clears', async () => {
    const s = built.s
    await okJson(s.fetch('/api/chores', { method: 'PATCH', body: { id: 'drillC4aaaaa' } }))
    const line = await env.DB.prepare('SELECT COUNT(*) AS n FROM task_participants WHERE task_id = ?').bind('drillC4aaaaa').first<{ n: number }>()
    expect(line?.n).toBe(1)
    await okJson(s.fetch('/api/chores', { method: 'PATCH', body: { id: 'drillC4aaaaa', undo: true } }))
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM task_participants WHERE task_id = ?').bind('drillC4aaaaa').first<{ n: number }>())?.n).toBe(0)
    await okJson(s.fetch('/api/todos', { method: 'PATCH', body: { clearChecked: true, ids: ['drillT5aaaaa'] } }))
    expect(await env.DB.prepare('SELECT id FROM home_projects WHERE id = ?').bind('drillT5aaaaa').first()).toBeNull()
    // A departure row still ticks in its own table.
    await okJson(s.fetch('/api/todos', { method: 'PATCH', body: { id: 'drillD1aaaaa', done: true } }))
    expect((await env.DB.prepare('SELECT done_at FROM todos WHERE id = ?').bind('drillD1aaaaa').first<{ done_at: number | null }>())?.done_at).not.toBeNull()
  })
})

describe('the safety net: a copy taken BEFORE the merge restores AFTER it', () => {
  it('the real pre-merge sample copy, restored through the door, reads back on /api/tasks exactly as it read before', async () => {
    const res = await restored.fetch('/api/takeout/restore', { method: 'POST', body: { password: restored.password, source: 'file', takeout: PREMERGE } })
    expect(res.status).toBe(200)
    const summary = (await res.json()) as { remapped: boolean; skippedTables: string[] }
    expect(summary.remapped, 'its ids are free in this database, so they are kept').toBe(false)
    expect(summary.skippedTables, 'no table of the old copy is dropped on the floor').toEqual([])
    const got = (await okJson<TasksWire>(restored.fetch('/api/tasks'))).tasks
    // The « before » is the sample's, computed on the drill database with fresh ids: map them back.
    const back = new Map([...sample.map].map(([a, b]) => [b, a]))
    const unmap = (x: unknown): unknown =>
      JSON.parse(JSON.stringify(x).replace(/[A-Za-z0-9]{8,32}/g, (tok) => (tok === sample.s.householdId ? (PREMERGE as { householdId: string }).householdId : (back.get(tok) ?? tok))))
    expect(byKey(got)).toEqual(byKey(unmap(sample.before.tasks) as TaskItem[]))
    // Faces: the chores came back as chores, the loose to-dos as to-dos, the checklists stayed put.
    const kinds = await all<{ kind: string; n: number }>(env.DB, 'SELECT kind, COUNT(*) AS n FROM home_projects WHERE household_id = ? GROUP BY kind ORDER BY kind', restored.householdId)
    expect(kinds).toEqual([
      { kind: 'chore', n: 8 },
      { kind: 'plan', n: 1 },
      { kind: 'todo', n: 8 },
      { kind: 'upkeep', n: 3 },
    ])
    expect((await all(env.DB, 'SELECT id FROM todos WHERE household_id = ?', restored.householdId)).length).toBe(4)
    expect((await all(env.DB, 'SELECT tp.id FROM task_participants tp JOIN home_projects t ON t.id = tp.task_id WHERE t.household_id = ?', restored.householdId)).length).toBe(2)
  })
})
