import { describe, it, expect, beforeAll } from 'vitest'
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'
import { parseRecur } from '../functions/_lib/recur'
import { choreTask, homeTask, spineTask, todoTask, type SpineTaskRow } from '../functions/_lib/taskItem'
import { TASK_COLS, type TaskRow } from '../functions/_lib/taskViews'
import type { TaskItem, TasksWire } from '../functions/_lib/wire'

// THE 0152 DRILL. Production rows are on the line, so the migration is RUN, not trusted on
// review: a second database (DRILL_DB) is migrated up to 0151, seeded with every variety a
// spine row can hold today, read by the readers as they were BEFORE (a recurring chore with
// no start « from created_at », through `choreTask`), handed 0152 itself, and read by the
// readers as they are now (`spineTask`, which reads `at` one way for every task). Every
// task's identity must come out the same.
//
// The variety: NULL in every optional column somewhere; recurring chores with no start
// (daily, weekly ticked today with a rotation, monthly cleared, yearly snoozed-ish);
// malformed recurrences of every shape `parseRecur` refuses (« hourly », 'null', a bare
// string, an array, not JSON, an empty string) which must NOT gain a date (a one-off chore
// given one would turn up owed); a duplicate `freq` key; one-off chores (undated, dated,
// ticked, cleared); a chore with a chosen start; to-dos; home rows (a recurring entretien
// with no date stays undated); and the REAL sample seed, copied from a seeded household.
//
// Planted red (2026-11-08): the WHERE without its `json_extract … IN` clause dates the
// malformed chores (identity differs: they turn up owed); without `kind = 'chore'` the
// undated recurring entretien gains a date. Each plant checked with grep before the run.

const DRILL = env.DRILL_DB
const MIGRATIONS = env.TEST_MIGRATIONS
const START = MIGRATIONS.filter((m) => m.name.startsWith('0152_'))
const now = Math.floor(Date.now() / 1000)
const today = localDayStart(new Date(now * 1000))
const D = (n: number) => addLocalDays(today, n)
const UTC_TODAY = Math.floor(Date.UTC(new Date(now * 1000).getUTCFullYear(), new Date(now * 1000).getUTCMonth(), new Date(now * 1000).getUTCDate()) / 1000)
const WEEKLY = JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [] })

type Row = Record<string, unknown>
const all = async <T = Row>(db: D1Database, sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).all<T>()).results
async function insertRows(db: D1Database, table: string, rows: Row[]) {
  for (const r of rows) {
    const keys = Object.keys(r)
    await db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => r[k] ?? null)).run()
  }
}

// THE READERS BEFORE: a chore's NULL start read as created_at (`choreTask` → `choreSchedule`),
// a to-do and a home row through their own builders. Exactly what taskViews did per face.
function before(r: TaskRow): TaskItem | null {
  if (r.kind === 'chore')
    return choreTask({ ...r, recur_start: r.at, created_at: r.created_at }, today, now)
  if (r.kind === 'todo')
    return todoTask({ id: r.id, title: r.title, day: r.at, member_id: r.member_id, done_at: r.last_done_at, section: null, source_template_id: null, subject_kind: r.subject_kind, subject_id: r.subject_id, icon: r.icon, color: r.color, effort: r.effort }, today)
  return homeTask(r as unknown as Parameters<typeof homeTask>[0], today, now)
}
// What a task IS to a household: never a key, never a stamp only one builder adds.
const identity = (i: TaskItem | null) =>
  i && {
    id: i.id,
    title: i.title,
    done: i.done,
    doneAt: i.doneAt,
    who_id: i.who_id,
    team: i.team,
    subject: i.subject,
    icon: i.icon,
    color: i.color,
    effort: i.effort,
    recurring: i.recurring,
    day: i.day,
    dueToday: i.dueToday,
    overdueSince: i.overdueSince,
    snoozedUntil: i.snoozedUntil,
  }

let variety: Session
let seeded: Session
const rowsOf = (hh: string) => all<TaskRow>(DRILL, `SELECT ${TASK_COLS} FROM home_projects WHERE household_id = ? ORDER BY id`, hh)
const rawOf = (hh: string) => all(DRILL, 'SELECT * FROM home_projects WHERE household_id = ? ORDER BY id', hh)
const beforeRows = new Map<string, TaskRow[]>()
const beforeRaw = new Map<string, Row[]>()

beforeAll(async () => {
  expect(START, 'the migration is on disk').toHaveLength(1)
  await applyD1Migrations(DRILL, MIGRATIONS.filter((m) => m.name < '0152_'))
  expect(await DRILL.prepare("SELECT 1 FROM d1_migrations WHERE name LIKE '0152_%'").first(), 'the drill starts before 0152').toBeNull()

  variety = await household('start-variety', undefined, { empty: true })
  seeded = await household('start-sample')
  for (const s of [variety, seeded]) await insertRows(DRILL, 'households', [(await env.DB.prepare('SELECT * FROM households WHERE id = ?').bind(s.householdId).first<Row>())!])

  const hh = variety.householdId
  const base = { household_id: hh, created_at: now - 40 * 86400, updated_at: now - 40 * 86400 }
  const chore = { ...base, kind: 'chore', recur_from: 'anchor' }
  await insertRows(DRILL, 'home_projects', [
    // recurring chores with NO start: the rows 0152 is for
    { ...chore, id: 'stC1aaaaaaaa', title: 'Vaisselle', recur_json: JSON.stringify({ freq: 'daily', interval: 1 }) },
    { ...chore, id: 'stC2aaaaaaaa', title: 'Poubelles', recur_json: WEEKLY, rotation_json: JSON.stringify(['m1', 'm2']), current_idx: 1, last_done_at: now - 60, last_done_by: 'm1', announce_evening: 1, lead_seconds: 3600 },
    { ...chore, id: 'stC3aaaaaaaa', title: 'Gouttières', recur_json: JSON.stringify({ freq: 'monthly', interval: 1 }), cleared_at: now - 30, last_done_at: now - 40, subject_kind: 'carnet', subject_id: 'carnetX', icon: '🏠', effort: 5, colour: '#B06A93' },
    { ...chore, id: 'stC4aaaaaaaa', title: 'Ramonage', recur_json: JSON.stringify({ freq: 'yearly', interval: 1 }), created_at: now - 400 * 86400 },
    // a chosen start: never overwritten
    { ...chore, id: 'stC5aaaaaaaa', title: 'Litière', recur_json: WEEKLY, at: UTC_TODAY - 9 * 86400 },
    // malformed recurrences: one-offs to every reader, and they must stay undated
    { ...chore, id: 'stC6aaaaaaaa', title: 'Horaire', recur_json: '{"freq":"hourly"}' },
    { ...chore, id: 'stC7aaaaaaaa', title: 'Nul', recur_json: 'null' },
    { ...chore, id: 'stC8aaaaaaaa', title: 'Chaîne', recur_json: '"weekly"' },
    { ...chore, id: 'stC9aaaaaaaa', title: 'Tableau', recur_json: '[{"freq":"weekly"}]' },
    { ...chore, id: 'stCAaaaaaaaa', title: 'Pas du JSON', recur_json: 'weekly' },
    { ...chore, id: 'stCBaaaaaaaa', title: 'Vide', recur_json: '' },
    { ...chore, id: 'stCCaaaaaaaa', title: 'Nombre', recur_json: '{"freq":7}' },
    // a duplicate key: JSON.parse keeps the LAST `freq`; the drill says whether SQLite agrees
    { ...chore, id: 'stCHaaaaaaaa', title: 'Clé double', recur_json: '{"freq":"hourly","freq":"weekly"}' },
    // one-off chores: undated, dated, ticked today, ticked and cleared
    { ...chore, id: 'stCDaaaaaaaa', title: 'Ranger le garage' },
    { ...chore, id: 'stCEaaaaaaaa', title: 'Rendre les livres', at: D(1), rotation_json: JSON.stringify(['m3']) },
    { ...chore, id: 'stCFaaaaaaaa', title: 'Arroser', last_done_at: now - 60 },
    { ...chore, id: 'stCGaaaaaaaa', title: 'Plier', last_done_at: now - 600, cleared_at: now - 300 },
    // to-dos: undated, dated, ticked
    { ...base, kind: 'todo', colour: null, id: 'stT1aaaaaaaa', title: 'Appeler', member_id: 'm1', position: 0 },
    { ...base, kind: 'todo', colour: null, id: 'stT2aaaaaaaa', title: 'Formulaire', at: today, position: 1, icon: '📝', effort: 1 },
    { ...base, kind: 'todo', colour: null, id: 'stT3aaaaaaaa', title: 'Coché', at: D(-2), last_done_at: now - 10, position: 2 },
    // home rows: a recurring entretien with NO date stays undated; a dated one; a plan
    { ...base, kind: 'upkeep', id: 'stH1aaaaaaaa', title: 'Filtre sans date', recur_json: WEEKLY },
    { ...base, kind: 'upkeep', id: 'stH2aaaaaaaa', title: 'Pneus', recur_json: WEEKLY, at: UTC_TODAY - 30 * 86400, snoozed_until: D(3) },
    { ...base, kind: 'plan', id: 'stH3aaaaaaaa', title: 'Cuisine', notes: 'trois devis', budget_cents: 1_500_000 },
  ])
  // The real sample seed, as a seeded household holds it.
  await insertRows(DRILL, 'home_projects', await all(env.DB, 'SELECT * FROM home_projects WHERE household_id = ?', seeded.householdId))

  for (const s of [variety, seeded]) {
    beforeRows.set(s.householdId, await rowsOf(s.householdId))
    beforeRaw.set(s.householdId, await rawOf(s.householdId))
  }

  // THE MIGRATION, as wrangler would apply it.
  await applyD1Migrations(DRILL, START)
}, 120_000)

describe('0152 — every recurring task carries its start', () => {
  it('the drill holds the variety (canary: an empty seed proves nothing)', () => {
    const v = beforeRows.get(variety.householdId)!
    expect(v.filter((r) => r.kind === 'chore' && r.at == null && parseRecur(r.recur_json) != null).length, 'recurring chores with no start').toBeGreaterThanOrEqual(4)
    expect(v.filter((r) => r.kind === 'chore' && r.recur_json != null && parseRecur(r.recur_json) == null).length, 'malformed recurrences').toBeGreaterThanOrEqual(6)
    expect(beforeRows.get(seeded.householdId)!.length, 'the sample seed').toBeGreaterThan(5)
  })

  for (const which of ['variety', 'sample'] as const) {
    it(`${which}: every task's identity is the same, the old readers before and the new reader after`, async () => {
      const hh = (which === 'variety' ? variety : seeded).householdId
      const was = new Map(beforeRows.get(hh)!.map((r) => [r.id, identity(before(r))]))
      const after = await rowsOf(hh)
      expect(after.map((r) => r.id)).toEqual([...was.keys()])
      for (const r of after) expect(identity(spineTask(r as SpineTaskRow, today, now)), r.id).toEqual(was.get(r.id))
    })

    it(`${which}: only \`at\` moved, only on a recurring chore that had none, and to its created_at`, async () => {
      const hh = (which === 'variety' ? variety : seeded).householdId
      const was = new Map(beforeRaw.get(hh)!.map((r) => [r.id as string, r]))
      for (const r of await rawOf(hh)) {
        const old = was.get(r.id as string)!
        const target = old.kind === 'chore' && old.at == null && parseRecur(old.recur_json as string | null) != null
        expect(r, r.id as string).toEqual(target ? { ...old, at: old.created_at } : old)
      }
    })
  }

  it('the targets, by name: the four recurring chores dated, the malformed and the entretien left alone', async () => {
    const at = new Map((await rowsOf(variety.householdId)).map((r) => [r.id, r.at]))
    for (const id of ['stC1aaaaaaaa', 'stC2aaaaaaaa', 'stC3aaaaaaaa', 'stC4aaaaaaaa']) expect(at.get(id), id).not.toBeNull()
    for (const id of ['stC6aaaaaaaa', 'stC7aaaaaaaa', 'stC8aaaaaaaa', 'stC9aaaaaaaa', 'stCAaaaaaaaa', 'stCBaaaaaaaa', 'stCCaaaaaaaa', 'stCDaaaaaaaa', 'stH1aaaaaaaa', 'stH3aaaaaaaa']) expect(at.get(id), id).toBeNull()
  })

  it('is idempotent: a second run changes nothing', async () => {
    const once = await rawOf(variety.householdId)
    for (const q of START[0]!.queries) await DRILL.prepare(q).run()
    expect(await rawOf(variety.householdId)).toEqual(once)
  })

  it('the real Worker reads the migrated rows the same: copied back, /api/tasks answers each task as before', async () => {
    const hh = variety.householdId
    await insertRows(env.DB, 'home_projects', await all(DRILL, 'SELECT * FROM home_projects WHERE household_id = ?', hh))
    const got = (await okJson<TasksWire>(variety.fetch('/api/tasks'))).tasks
    const was = new Map(beforeRows.get(hh)!.map((r) => [r.id, identity(before(r))]))
    for (const t of got) expect(identity(t), t.id).toEqual(was.get(t.id))
    // Not vacuous: the four recurring chores with no start are among them, and still recurring.
    expect(got.filter((t) => ['stC1aaaaaaaa', 'stC2aaaaaaaa', 'stC3aaaaaaaa', 'stC4aaaaaaaa'].includes(t.id) && t.recurring)).toHaveLength(4)
  })
})
