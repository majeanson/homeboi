import { describe, it, expect } from 'vitest'
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { household, okJson } from '../functions/test/d1'
import { nowSec } from '../functions/_lib/ids'
import type { TasksWire } from '../functions/_lib/wire'

// 0151 — the deploy-window sweep. An old Worker, still serving for a minute after 0150 ran,
// can INSERT a loose to-do into `todos` the old way. 0151 moves it into the spine with its id,
// leaves departure rows alone, and is safe to run twice.
//
// It runs in ITS era: a second database (DRILL_DB) migrated up to 0150, because the Worker's
// own database is past 0153, whose CHECK refuses the 'todo' kind 0151 writes (that is the
// point of the CHECK). Then the later migrations, as production went, and the rows read back
// through the real Worker. Planted red by dropping the `id NOT IN` clause: the doubled row
// then fails on the PRIMARY KEY.

const DRILL = env.DRILL_DB
const MIGRATIONS = env.TEST_MIGRATIONS
const SWEEP = MIGRATIONS.filter((m) => m.name.startsWith('0151_'))
const run = async () => {
  for (const q of SWEEP[0]!.queries) await DRILL.prepare(q).run()
}

describe('0151 — the to-dos an old Worker wrote in the window', () => {
  it('moves a loose row into the spine with its id, leaves a departure row, runs twice', async () => {
    expect(SWEEP, 'the sweep is on disk').toHaveLength(1)
    await applyD1Migrations(DRILL, MIGRATIONS.filter((m) => m.name < '0151_'))
    const s = await household('window-sweep', undefined, { empty: true })
    const hhRow = await env.DB.prepare('SELECT * FROM households WHERE id = ?').bind(s.householdId).first<Record<string, unknown>>()
    const keys = Object.keys(hhRow!)
    await DRILL.prepare(`INSERT INTO households (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => hhRow![k] ?? null)).run()
    const ts = nowSec()
    // Exactly what the pre-merge POST /api/todos wrote: NULL in every optional column.
    await DRILL.prepare(
      'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL, NULL, ?, ?)',
    )
      .bind('winLoose0001', s.householdId, 'Écrit pendant la fenêtre', ts, ts)
      .run()
    await DRILL.prepare(
      "INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL, 'departure-adhoc', ?, ?)",
    )
      .bind('winDepart001', s.householdId, 'Clés', ts, ts)
      .run()

    await run()
    await run()

    const spine = await DRILL.prepare('SELECT id, kind, title, at, last_done_at FROM home_projects WHERE household_id = ?').bind(s.householdId).all()
    expect(spine.results).toEqual([{ id: 'winLoose0001', kind: 'todo', title: 'Écrit pendant la fenêtre', at: null, last_done_at: null }])
    const left = await DRILL.prepare('SELECT id FROM todos WHERE household_id = ?').bind(s.householdId).all()
    expect(left.results).toEqual([{ id: 'winDepart001' }])
    // A row already in the spine AND still in todos (a replay, a half-run): the spine copy
    // wins, nothing is copied twice, and the todos copy goes.
    await DRILL.prepare("INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES ('winLoose0001', ?, 'Doublon', NULL, NULL, 0, NULL, NULL, NULL, ?, ?)").bind(s.householdId, ts, ts).run()
    await run()
    expect((await DRILL.prepare('SELECT title FROM home_projects WHERE id = ?').bind('winLoose0001').first())).toEqual({ title: 'Écrit pendant la fenêtre' })
    expect((await DRILL.prepare('SELECT id FROM todos WHERE household_id = ?').bind(s.householdId).all()).results).toEqual([{ id: 'winDepart001' }])

    // Then every later migration, as production went (0153: the loose row is a task, no kind),
    // and the row read back through the real Worker.
    await applyD1Migrations(DRILL, MIGRATIONS.filter((m) => m.name > '0151_'))
    const rows = (await DRILL.prepare('SELECT * FROM home_projects WHERE household_id = ?').bind(s.householdId).all<Record<string, unknown>>()).results
    expect(rows.map((r) => r.kind)).toEqual([null])
    for (const r of rows) {
      const k = Object.keys(r)
      await env.DB.prepare(`INSERT INTO home_projects (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).bind(...k.map((x) => r[x] ?? null)).run()
    }
    const tasks = await okJson<TasksWire>(s.fetch('/api/tasks'))
    expect(tasks.tasks.map((t) => t.title)).toEqual(['Écrit pendant la fenêtre'])
  })
})
