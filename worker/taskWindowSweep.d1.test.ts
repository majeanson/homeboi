import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson } from '../functions/test/d1'
import { nowSec } from '../functions/_lib/ids'
import type { TasksWire } from '../functions/_lib/wire'

// 0151 — the deploy-window sweep. An old Worker, still serving for a minute after 0150 ran,
// can INSERT a loose to-do into `todos` the old way. 0151 moves it into the spine with its id,
// leaves departure rows alone, and is safe to run twice. The harness has already applied it
// to an empty table, so this replays its own statements against rows written the old way.
// Planted red by dropping the `id NOT IN` clause: the doubled row then fails on the PRIMARY KEY.

const SWEEP = env.TEST_MIGRATIONS.filter((m) => m.name.startsWith('0151_'))
const run = async () => {
  for (const q of SWEEP[0]!.queries) await env.DB.prepare(q).run()
}

describe('0151 — the to-dos an old Worker wrote in the window', () => {
  it('moves a loose row into the spine with its id, leaves a departure row, runs twice', async () => {
    expect(SWEEP, 'the sweep is on disk').toHaveLength(1)
    const s = await household('window-sweep', undefined, { empty: true })
    const ts = nowSec()
    // Exactly what the pre-merge POST /api/todos wrote: NULL in every optional column.
    await env.DB.prepare(
      'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL, NULL, ?, ?)',
    )
      .bind('winLoose0001', s.householdId, 'Écrit pendant la fenêtre', ts, ts)
      .run()
    await env.DB.prepare(
      "INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL, 'departure-adhoc', ?, ?)",
    )
      .bind('winDepart001', s.householdId, 'Clés', ts, ts)
      .run()

    await run()
    await run()

    const spine = await env.DB.prepare('SELECT id, kind, title, at, last_done_at FROM home_projects WHERE household_id = ?').bind(s.householdId).all()
    expect(spine.results).toEqual([{ id: 'winLoose0001', kind: 'todo', title: 'Écrit pendant la fenêtre', at: null, last_done_at: null }])
    const left = await env.DB.prepare('SELECT id FROM todos WHERE household_id = ?').bind(s.householdId).all()
    expect(left.results).toEqual([{ id: 'winDepart001' }])
    // A row already in the spine AND still in todos (a replay, a half-run): the spine copy
    // wins, nothing is copied twice, and the todos copy goes.
    await env.DB.prepare("INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES ('winLoose0001', ?, 'Doublon', NULL, NULL, 0, NULL, NULL, NULL, ?, ?)").bind(s.householdId, ts, ts).run()
    await run()
    expect((await env.DB.prepare('SELECT title FROM home_projects WHERE id = ?').bind('winLoose0001').first())).toEqual({ title: 'Écrit pendant la fenêtre' })
    expect((await env.DB.prepare('SELECT id FROM todos WHERE household_id = ?').bind(s.householdId).all()).results).toEqual([{ id: 'winDepart001' }])
    const tasks = await okJson<TasksWire>(s.fetch('/api/tasks'))
    expect(tasks.tasks.map((t) => t.title)).toEqual(['Écrit pendant la fenêtre'])
  })
})
