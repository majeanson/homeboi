import { describe, it, expect, beforeAll } from 'vitest'
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart, localTimeOnDay } from '../functions/_lib/ids'
import { runWithTz } from '../functions/_lib/tz'
import { spineTask, type SpineTaskRow } from '../functions/_lib/taskItem'
import { TASK_COLS, cellsOf, type TaskRow } from '../functions/_lib/taskViews'
import { normalizeTaskDays, taskDay } from '../functions/_lib/taskDay'
import type { TaskItem, TasksWire } from '../functions/_lib/wire'

// THE 0153 DRILL (`kind` → plan | upkeep | NULL, and every task's day a household-local
// midnight). Production rows are on the line, so the change is RUN, not trusted on review.
//
// A second database (DRILL_DB) is migrated up to 0152 and seeded with every variety a task row
// holds today, for THREE households in three zones: America/Toronto (the default, west of
// Greenwich: a UTC midnight is the evening before), Europe/Paris (east: a UTC midnight is
// 01:00 the same day) and Asia/Tokyo (no DST at all), with dates on both sides of each DST
// change (Toronto 2026-03-08 / 2026-11-01 / 2027-03-14, Paris 2026-03-29 / 2026-10-25 /
// 2027-03-28). Every encoding `at` has held: a UTC midnight (the old chore and home forms), a
// local midnight (a to-do, a capture), an instant (0152's created_at start). One-off and
// recurring; chore, to-do, upkeep, plan; with and without « chacun son tour »; ticked, cleared,
// ticked on an earlier day; snoozed; a malformed recurrence; NULL in every optional column
// somewhere; departure checklists and « qui a aidé » lines beside them.
//
// It is read by the readers as they were BEFORE (the one builder on the raw row, the rule
// every reader applied: a day is the local day containing `at`), handed 0153 itself, then the
// Worker-side backfill (`normalizeTaskDays`), and read again. What must hold:
//   · every task's identity and its DISPLAYED day (the local calendar day of `day`, of the owed
//     date, of every calendar cell) is the same before and after, in its own zone;
//   · `kind` lost exactly 'chore' and 'todo', and nothing else of a row moved but `at`, which
//     is now the local midnight of the day it already displayed;
//   · nothing else (departure rows, « qui a aidé ») moved; both steps are idempotent;
//   · the REAL Worker, handed the rows BEFORE the backfill ran, already answers the same (the
//     decoder), and after it too.
// Two answers change, both from the owner's decision 3 (a day is a midnight), and the drill
// pins each one by name: the « Bientôt » window counts from midnight (`soon` is not compared),
// and a series ticked on its day BEFORE its anchor hour is no longer owed the next morning.
//
// Planted red (2026-11-10), each plant checked with grep before the run: the backfill reading
// `localDayStart(new Date(r.at * 1000))` with no zone (Paris and Tokyo rows move a day); the
// decoder dropped from taskViews' row helper (the Worker step fails before the backfill); the
// CASE in 0153 keeping 'chore' (the CHECK refuses the copy, the migration fails).

const DRILL = env.DRILL_DB
const MIGRATIONS = env.TEST_MIGRATIONS
const SHRINK = MIGRATIONS.filter((m) => m.name.startsWith('0153_'))
const now = Math.floor(Date.now() / 1000)
const ZONES = ['America/Toronto', 'Europe/Paris', 'Asia/Tokyo'] as const
type Zone = (typeof ZONES)[number]
const WEEKLY = JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [] })
const TWO_DAYS = JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [1, 3] })
const DAILY = JSON.stringify({ freq: 'daily', interval: 1 })
const MONTHLY = JSON.stringify({ freq: 'monthly', interval: 1 })
const YEARLY = JSON.stringify({ freq: 'yearly', interval: 1 })

type Row = Record<string, unknown>
const all = async <T = Row>(db: D1Database, sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).all<T>()).results
async function insertRows(db: D1Database, table: string, rows: Row[]) {
  for (const r of rows) {
    const keys = Object.keys(r)
    await db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => r[k] ?? null)).run()
  }
}

// In a zone: its today, a local midnight, an instant at a wall time, the old form's UTC midnight.
const inZone = (tz: Zone) => {
  const today = runWithTz(tz, () => localDayStart(new Date(now * 1000)))
  const local = (y: number, m: number, d: number) => runWithTz(tz, () => localDayStart(new Date(Date.UTC(y, m - 1, d, 12))))
  return {
    today,
    D: (n: number) => runWithTz(tz, () => addLocalDays(today, n)),
    local,
    wall: (y: number, m: number, d: number, h: number, mi: number) => runWithTz(tz, () => localTimeOnDay(local(y, m, d), h * 3600 + mi * 60)),
    utc: (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000,
  }
}

// One household's variety. `p` makes the ids unique per household.
function variety(hh: string, p: string, tz: Zone): { rows: Row[]; departures: Row[]; lines: Row[] } {
  const z = inZone(tz)
  const base = { household_id: hh, created_at: now - 90 * 86400, updated_at: now - 90 * 86400, recur_from: 'anchor', rotation_json: '[]', current_idx: 0, position: 0, is_sample: 0 }
  const chore = { ...base, kind: 'chore', colour: '#88a36f' }
  const todo = { ...base, kind: 'todo', colour: null }
  const id = (s: string) => `${p}${s}`.padEnd(12, 'a')
  const rows: Row[] = [
    // CHORES (the old chore form wrote a UTC midnight; 0152 wrote created_at, an instant)
    { ...chore, id: id('C1'), title: 'Rendre les livres', at: z.utc(2026, 10, 31), rotation_json: JSON.stringify(['m3']) },
    { ...chore, id: id('C2'), title: 'Poubelles', recur_json: WEEKLY, at: z.utc(2026, 10, 25), rotation_json: JSON.stringify(['m1', 'm2']), current_idx: 1, last_done_at: now - 60, last_done_by: 'm1', announce_evening: 1, lead_seconds: 3600 },
    // ticked YESTERDAY at 09:00, before its 14:37 anchor: the one owed date that changes (decision 3)
    { ...chore, id: id('C3'), title: 'Vaisselle', recur_json: DAILY, at: z.wall(2026, 10, 1, 14, 37), last_done_at: z.D(-1) + 9 * 3600 },
    { ...chore, id: id('C4'), title: 'Gouttières', recur_json: MONTHLY, at: z.utc(2026, 11, 2), subject_kind: 'carnet', subject_id: 'carnetX', icon: '🏠', effort: 5, colour: '#B06A93' },
    { ...chore, id: id('C5'), title: 'Ramonage', recur_json: YEARLY, at: z.utc(2027, 3, 14) },
    { ...chore, id: id('C6'), title: 'Horaire', recur_json: '{"freq":"hourly"}' },
    { ...chore, id: id('C7'), title: 'Plier', last_done_at: now - 600, cleared_at: now - 300 },
    { ...chore, id: id('C8'), title: 'Arroser', recur_json: TWO_DAYS, at: z.utc(2026, 3, 8), lead_seconds: 86400, rotation_json: JSON.stringify(['m1', 'm2', 'm3']), current_idx: 2 },
    { ...chore, id: id('C9'), title: 'Litière', recur_json: WEEKLY, at: z.wall(2026, 3, 29, 1, 30) },
    { ...chore, id: id('CA'), title: 'Le bac du printemps', at: z.utc(2027, 3, 28), lead_seconds: 172800 },
    // TO-DOS (a local midnight, always)
    { ...todo, id: id('T1'), title: 'Appeler', member_id: 'm1' },
    { ...todo, id: id('T2'), title: 'Formulaire', at: z.today, icon: '📝', effort: 1, position: 1 },
    { ...todo, id: id('T3'), title: 'Passé coché', at: z.local(2026, 10, 25), last_done_at: z.D(-1) + 100, position: 2 },
    { ...todo, id: id('T4'), title: 'En retard', at: z.local(2026, 11, 1), position: 3 },
    { ...todo, id: id('T5'), title: 'Demain, coché', at: z.D(1), last_done_at: now - 30, position: 4 },
    { ...todo, id: id('T6'), title: 'Au printemps', at: z.local(2027, 3, 28), colour: '#5891AC', position: 5 },
    // HOME ROWS (the old home form wrote a UTC midnight; a season seed or the sample a local one)
    { ...base, kind: 'upkeep', id: id('H1'), title: 'Pneus', recur_json: WEEKLY, at: z.utc(2026, 10, 24), snoozed_until: z.D(3), colour: '#88a36f' },
    { ...base, kind: 'upkeep', id: id('H2'), title: 'Filtre', recur_json: MONTHLY, recur_from: 'done', at: z.utc(2026, 9, 1), last_done_at: z.D(-5), colour: '#88a36f' },
    { ...base, kind: 'plan', id: id('H3'), title: 'Peinturer', at: z.utc(2026, 11, 20), notes: 'trois devis', budget_cents: 1_500_000, colour: '#88a36f' },
    { ...base, kind: 'plan', id: id('H4'), title: 'Cuisine', colour: '#88a36f' },
    { ...base, kind: 'upkeep', id: id('H5'), title: 'Vaccin', recur_json: YEARLY, at: z.utc(2026, 3, 29), rotation_json: JSON.stringify(['m1', 'm2']), colour: '#88a36f' },
    { ...base, kind: 'upkeep', id: id('H6'), title: 'Thermopompe', recur_json: WEEKLY, at: z.local(2026, 10, 26), carnet_id: 'carnetX', lead_seconds: 86400, last_done_at: z.D(-7), colour: '#88a36f' },
  ]
  const departures: Row[] = [
    { id: id('D1'), household_id: hh, title: 'Clés', day: z.today, member_id: null, position: 0, done_at: null, section: 'Avant de partir', source_template_id: 'tplX', created_at: now - 60, updated_at: now - 60 },
    { id: id('D2'), household_id: hh, title: 'Gourde', day: z.today, member_id: null, position: 1, done_at: now - 10, section: 'Avant de partir', source_template_id: 'departure-adhoc', created_at: now - 60, updated_at: now - 60 },
  ]
  const lines: Row[] = [{ id: id('P1'), task_id: id('C2'), member_id: null, role: 'parent', contributed_at: now - 60 }]
  return { rows, departures, lines }
}

// What a household SEES of a task, in its zone: never a key or a source (0153 renames those),
// never `soon` (decision 3 moves its window), every date as the calendar day it shows.
const shown = (i: TaskItem | null, tz: Zone) =>
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
    kind: i.kind,
    day: taskDay(i.day, tz),
    dueToday: i.dueToday,
    overdueSince: taskDay(i.overdueSince, tz),
    snoozedUntil: i.snoozedUntil,
    onBoard: i.onBoard,
  }
const read = (r: TaskRow, tz: Zone) => runWithTz(tz, () => spineTask(r as SpineTaskRow, inZone(tz).today, now))
// Every calendar cell over a window spanning both DST changes, as (task, the day it shows, done, whose turn).
const cells = (rows: TaskRow[], tz: Zone) =>
  runWithTz(tz, () => {
    const z = inZone(tz)
    const dayOf = (at: number) => localDayStart(new Date(at * 1000))
    return cellsOf(rows, z.local(2026, 2, 15), z.local(2027, 4, 15), dayOf)
      .map((c) => `${c.taskId}|${c.day}|${c.done}|${c.who_id}|${c.recurring}`)
      .sort()
  })

interface Household {
  s: Session
  tz: Zone
  p: string
  before: TaskRow[]
  raw: Row[]
  departures: Row[]
  lines: Row[]
}
const houses: Household[] = []
const rowsOf = (hh: string) => all<TaskRow>(DRILL, `SELECT ${TASK_COLS} FROM home_projects WHERE household_id = ? ORDER BY id`, hh)
const rawOf = (hh: string) => all(DRILL, 'SELECT * FROM home_projects WHERE household_id = ? ORDER BY id', hh)
let afterShrink = new Map<string, Row[]>()
let fixedFirst = 0
let fixedAgain = -1

beforeAll(async () => {
  expect(SHRINK, 'the migration is on disk').toHaveLength(1)
  await applyD1Migrations(DRILL, MIGRATIONS.filter((m) => m.name < '0153_'))
  expect(await DRILL.prepare("SELECT 1 FROM d1_migrations WHERE name LIKE '0153_%'").first(), 'the drill starts before 0153').toBeNull()

  for (const [i, tz] of ZONES.entries()) {
    const s = await household(`shrink-${i}`, undefined, { empty: true })
    await env.DB.prepare('UPDATE households SET tz = ? WHERE id = ?').bind(tz, s.householdId).run()
    await insertRows(DRILL, 'households', [(await env.DB.prepare('SELECT * FROM households WHERE id = ?').bind(s.householdId).first<Row>())!])
    const p = `k${i}`
    const v = variety(s.householdId, p, tz)
    await insertRows(DRILL, 'home_projects', v.rows)
    await insertRows(DRILL, 'todos', v.departures)
    await insertRows(DRILL, 'task_participants', v.lines)
    houses.push({
      s,
      tz,
      p,
      before: await rowsOf(s.householdId),
      raw: await rawOf(s.householdId),
      departures: await all(DRILL, 'SELECT * FROM todos WHERE household_id = ? ORDER BY id', s.householdId),
      lines: await all(DRILL, 'SELECT tp.* FROM task_participants tp JOIN home_projects t ON t.id = tp.task_id WHERE t.household_id = ? ORDER BY tp.id', s.householdId),
    })
  }

  // THE MIGRATION, as wrangler would apply it…
  await applyD1Migrations(DRILL, SHRINK)
  afterShrink = new Map(await Promise.all(houses.map(async (h) => [h.s.householdId, await rawOf(h.s.householdId)] as const)))
  // …then the Worker's backfill, as the nightly cron runs it, twice.
  fixedFirst = await normalizeTaskDays(DRILL)
  fixedAgain = await normalizeTaskDays(DRILL)
}, 120_000)

describe('0153 — a task is a task, and its day is a local midnight', () => {
  it('the drill holds the variety (canary: an empty seed proves nothing)', () => {
    expect(houses.map((h) => h.tz)).toEqual([...ZONES])
    for (const h of houses) {
      const kinds = h.raw.map((r) => r.kind)
      for (const k of ['chore', 'todo', 'upkeep', 'plan']) expect(kinds.filter((x) => x === k).length, `${h.tz} ${k}`).toBeGreaterThanOrEqual(2)
      // Every encoding is there: UTC midnights, local midnights, and instants that are neither.
      const ats = h.raw.map((r) => r.at).filter((a): a is number => typeof a === 'number')
      expect(ats.filter((a) => a % 86400 === 0).length, `${h.tz}: UTC midnights`).toBeGreaterThanOrEqual(5)
      expect(ats.filter((a) => a === taskDay(a, h.tz) && a % 86400 !== 0).length, `${h.tz}: local midnights`).toBeGreaterThanOrEqual(3)
      expect(ats.filter((a) => a !== taskDay(a, h.tz) && a % 86400 !== 0).length, `${h.tz}: instants`).toBeGreaterThanOrEqual(2)
      // NULL in the optional columns, open tasks to lose: a NULL predicate once hid them all.
      expect(h.before.filter((r) => r.at == null && r.last_done_at == null).length).toBeGreaterThanOrEqual(3)
    }
    // West of Greenwich a UTC midnight shows the day BEFORE; east of it, the same day.
    const [toronto, paris] = houses
    const c1 = (h: Household) => h.before.find((r) => r.id === `${h.p}C1`.padEnd(12, 'a'))!.at!
    expect(taskDay(c1(toronto!), 'America/Toronto')).toBe(inZone('America/Toronto').local(2026, 10, 30))
    expect(taskDay(c1(paris!), 'Europe/Paris')).toBe(inZone('Europe/Paris').local(2026, 10, 31))
  })

  it('the migration shrinks `kind` and touches nothing else, `at` included (the Worker owns that)', () => {
    for (const h of houses) {
      const after = afterShrink.get(h.s.householdId)!
      expect(after.map((r) => r.id)).toEqual(h.raw.map((r) => r.id))
      for (const [i, r] of after.entries()) {
        const old = h.raw[i]!
        const kind = old.kind === 'plan' || old.kind === 'upkeep' ? old.kind : null
        expect(r, r.id as string).toEqual({ ...old, kind })
      }
    }
  })

  it('the backfill writes every day as the local midnight it already showed, in each household’s own zone', async () => {
    expect(fixedFirst, 'the UTC midnights and the instants of three households').toBeGreaterThan(20)
    for (const h of houses) {
      const before = new Map(h.raw.map((r) => [r.id as string, r]))
      for (const r of await rawOf(h.s.householdId)) {
        const old = before.get(r.id as string)!
        const kind = old.kind === 'plan' || old.kind === 'upkeep' ? old.kind : null
        expect(r, `${h.tz} ${r.id as string}`).toEqual({ ...old, kind, at: taskDay(old.at as number | null, h.tz) })
        if (r.at != null) expect(taskDay(r.at as number, h.tz), `${h.tz} ${r.id as string}: a local midnight`).toBe(r.at)
      }
    }
  })

  it('is idempotent: a second backfill changes nothing, and so does a second run of the migration', async () => {
    expect(fixedAgain).toBe(0)
    const once = await Promise.all(houses.map((h) => rawOf(h.s.householdId)))
    for (const q of SHRINK[0]!.queries) await DRILL.prepare(q).run()
    expect(await normalizeTaskDays(DRILL)).toBe(0)
    expect(await Promise.all(houses.map((h) => rawOf(h.s.householdId)))).toEqual(once)
  })

  it('departure checklists and « qui a aidé » are untouched', async () => {
    for (const h of houses) {
      expect(await all(DRILL, 'SELECT * FROM todos WHERE household_id = ? ORDER BY id', h.s.householdId)).toEqual(h.departures)
      expect(await all(DRILL, 'SELECT tp.* FROM task_participants tp JOIN home_projects t ON t.id = tp.task_id WHERE t.household_id = ? ORDER BY tp.id', h.s.householdId)).toEqual(h.lines)
    }
  })

  for (const [n, tz] of ZONES.entries()) {
    it(`${tz}: every task's identity and DISPLAYED day are the same, but for the one owed date decision 3 moves`, async () => {
      const h = houses[n]!
      const after = new Map((await rowsOf(h.s.householdId)).map((r) => [r.id, shown(read(r, tz), tz)]))
      const vaisselle = `${h.p}C3`.padEnd(12, 'a')
      for (const r of h.before) {
        const was = shown(read(r, tz), tz)
        const now_ = after.get(r.id)
        if (r.id === vaisselle) {
          // Ticked yesterday at 09:00, before its 14:37 occurrence: owed before, covered now.
          expect(was?.overdueSince, 'before: owed since yesterday').toBe(inZone(tz).D(-1))
          expect(now_?.overdueSince, 'after: the tick covers its day').toBeNull()
          expect({ ...now_, overdueSince: was?.overdueSince }).toEqual(was)
          continue
        }
        expect(now_, `${tz} ${r.id}`).toEqual(was)
      }
    })

    it(`${tz}: every calendar cell shows on the same day, with the same turn, across both DST changes`, async () => {
      const h = houses[n]!
      expect(cells(await rowsOf(h.s.householdId), tz)).toEqual(cells(h.before, tz))
      expect(cells(h.before, tz).length, 'canary: a window that holds the series').toBeGreaterThan(400)
    })
  }

  it('the REAL Worker reads the same, BEFORE the backfill (the decoder) and after it', async () => {
    for (const [n, tz] of ZONES.entries()) {
      const h = houses[n]!
      // The rows exactly as 0153 left them, `at` still in the three old encodings.
      await insertRows(env.DB, 'home_projects', afterShrink.get(h.s.householdId)!)
      await insertRows(env.DB, 'task_participants', h.lines)
      const was = new Map(h.before.map((r) => [r.id, shown(read(r, tz), tz)]))
      const vaisselle = `${h.p}C3`.padEnd(12, 'a')
      const check = (got: TaskItem[]) => {
        expect(got.length, `${tz}: canary`).toBeGreaterThan(15)
        for (const t of got) {
          const w = was.get(t.id)!
          const s = shown(t, tz)!
          expect(t.day == null || t.day === taskDay(t.day, tz), `${tz} ${t.id}: a day is a midnight on the wire`).toBe(true)
          expect(t.id === vaisselle ? { ...s, overdueSince: w.overdueSince } : s, `${tz} ${t.id}`).toEqual(w)
        }
      }
      check((await okJson<TasksWire>(h.s.fetch('/api/tasks'))).tasks)
      expect(await normalizeTaskDays(env.DB, h.s.householdId)).toBeGreaterThan(5)
      check((await okJson<TasksWire>(h.s.fetch('/api/tasks'))).tasks)
      // The one form reads the day back as the date the household sees (lib/taskSave: chores serves every task).
      const chores = await okJson<{ chores: { id: string; recur_start: number | null }[] }>(h.s.fetch('/api/chores'))
      const c1 = chores.chores.find((c) => c.id === `${h.p}C1`.padEnd(12, 'a'))!
      expect(c1.recur_start).toBe(taskDay(h.before.find((r) => r.id === c1.id)!.at, tz))
    }
  })
})
