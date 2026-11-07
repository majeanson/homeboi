import { okWire } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, nowSec } from '../_lib/ids'
import { parseSubject, type SubjectRef } from '../_lib/subject'
import { CHORE_TASK_COLS, HOME_TASK_COLS, choreTask, homeTask, present, todoTask, type ChoreTaskRow, type HomeTaskRow, type TodoTaskRow } from '../_lib/taskItem'
import type { TasksWire } from '../_lib/wire'

// GET /api/tasks — every task the household holds, as one list, for the « Tâches » board view
// and a subject's page. Cold path on purpose: it is read when one of those opens and refreshed
// by a realtime nudge, never polled. The bento board does NOT read this: it stays on
// /api/board + /api/todos, because the board is the free-tier lever (`board-poll.test.ts`).
//
// `subjects` carries the small rows `subjectOf()` needs to name what a task is about, in one
// round trip, so a view of the household's tasks needs no second fetch per kind.
//
// `?subject=<kind>:<id>` adds that subject's `history`: what was done, when, and by whom.
// Names and dates, newest first, never a count or a total (NFR-CALM-1). It reads the rows
// that are already there: a chore's contribution log, a project's last completion, and the
// to-dos whose day has passed, which is exactly what the end-of-day clear leaves behind.
const HISTORY_MAX = 30
// A backstop, not a page size: a household holds a few dozen tasks, and the read is cold.
const ROWS_MAX = 500

async function historyOf(db: D1Database, hh: string, ref: SubjectRef, today: number): Promise<TasksWire['history']> {
  // A carnet on home_projects lives in carnet_id (migration 0146).
  const homeMatch = ref.kind === 'carnet' ? 'carnet_id = ?' : 'subject_kind = ? AND subject_id = ?'
  const homeBinds = ref.kind === 'carnet' ? [ref.id] : [ref.kind, ref.id]
  const [chores, homes, todos] = await Promise.all([
    db
      .prepare(
        `SELECT t.id, t.title, tp.contributed_at AS at, tp.member_id AS who_id
           FROM task_participants tp
           JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
          WHERE t.subject_kind = ? AND t.subject_id = ?
          ORDER BY tp.contributed_at DESC LIMIT ?`,
      )
      .bind(hh, ref.kind, ref.id, HISTORY_MAX)
      .all<{ id: string; title: string; at: number; who_id: string | null }>(),
    db
      .prepare(`SELECT id, title, last_done_at AS at, last_done_by AS who_id FROM home_projects WHERE household_id = ? AND last_done_at IS NOT NULL AND ${homeMatch} ORDER BY last_done_at DESC LIMIT ?`)
      .bind(hh, ...homeBinds, HISTORY_MAX)
      .all<{ id: string; title: string; at: number; who_id: string | null }>(),
    db
      .prepare('SELECT id, title, done_at AS at, member_id AS who_id FROM todos WHERE household_id = ? AND subject_kind = ? AND subject_id = ? AND done_at IS NOT NULL AND done_at < ? ORDER BY done_at DESC LIMIT ?')
      .bind(hh, ref.kind, ref.id, today, HISTORY_MAX)
      .all<{ id: string; title: string; at: number; who_id: string | null }>(),
  ])
  const line = (source: string) => (r: { id: string; title: string; at: number; who_id: string | null }) => ({
    key: `${source}:${r.id}:${r.at}`,
    title: r.title,
    at: r.at,
    who_id: r.who_id,
  })
  return [...chores.results.map(line('chore')), ...homes.results.map(line('home')), ...todos.results.map(line('todo'))]
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORY_MAX)
}

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const db = ctx.env.DB
  const now = nowSec()
  const today = localDayStart(new Date(now * 1000))

  const [chores, homes, todos, carnets, contacts, pets, trips] = await Promise.all([
    db.prepare(`SELECT ${CHORE_TASK_COLS} FROM tasks WHERE household_id = ? ORDER BY created_at LIMIT ?`).bind(hh, ROWS_MAX).all<ChoreTaskRow>(),
    db.prepare(`SELECT ${HOME_TASK_COLS} FROM home_projects WHERE household_id = ? ORDER BY created_at LIMIT ?`).bind(hh, ROWS_MAX).all<HomeTaskRow>(),
    // Loose rows only, and only what has not cleared. A departure instance is not a task.
    db
      .prepare(
        'SELECT id, title, day, member_id, done_at, section, source_template_id, subject_kind, subject_id FROM todos WHERE household_id = ? AND source_template_id IS NULL AND section IS NULL AND (done_at IS NULL OR done_at >= ?) ORDER BY created_at, position LIMIT ?',
      )
      .bind(hh, today, ROWS_MAX)
      .all<TodoTaskRow>(),
    db
      .prepare('SELECT id, name, kind, colour AS color, facts_json FROM carnets WHERE household_id = ? AND archived_at IS NULL ORDER BY position, name LIMIT ?')
      .bind(hh, ROWS_MAX)
      .all<{ id: string; name: string; kind: string; color: string | null; facts_json: string | null }>(),
    // A guest link can be minted to the household's own data, so the address book stays
    // out of it. A task about someone then reads as its kind, with no name.
    actor.scope === 'guest'
      ? Promise.resolve({ results: [] as { id: string; first_name: string; last_name: string; nickname: string | null; member_id: string | null }[] })
      : db
          .prepare('SELECT id, first_name, last_name, nickname, member_id FROM contacts WHERE household_id = ? ORDER BY first_name LIMIT ?')
          .bind(hh, ROWS_MAX)
          .all<{ id: string; first_name: string; last_name: string; nickname: string | null; member_id: string | null }>(),
    db.prepare('SELECT id, name, colour FROM pets WHERE household_id = ? AND deleted_at IS NULL ORDER BY name LIMIT ?').bind(hh, ROWS_MAX).all<{ id: string; name: string; colour: string | null }>(),
    db.prepare('SELECT id, title, colour FROM trips WHERE household_id = ? AND deleted_at IS NULL ORDER BY start_at DESC LIMIT ?').bind(hh, ROWS_MAX).all<{ id: string; title: string; colour: string | null }>(),
  ])

  const emojiOf = (json: string | null): { emoji: string } | null => {
    if (!json) return null
    try {
      const f = JSON.parse(json) as { emoji?: unknown }
      return typeof f.emoji === 'string' && f.emoji.trim() ? { emoji: f.emoji } : null
    } catch {
      return null
    }
  }

  const url = new URL(ctx.request.url)
  const raw = url.searchParams.get('subject')
  const sep = raw ? raw.indexOf(':') : -1
  const ref = raw && sep > 0 ? parseSubject({ kind: raw.slice(0, sep), id: raw.slice(sep + 1) }) : null

  return okWire('tasks', {
    tasks: [
      ...homes.results.map((h) => homeTask(h, today, now)),
      ...chores.results.map((c) => choreTask(c, today, now)),
      ...todos.results.map((td) => todoTask(td, today)),
    ].filter(present),
    subjects: {
      carnets: carnets.results.map((c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, facts: emojiOf(c.facts_json) })),
      contacts: contacts.results.map((c) => ({ id: c.id, name: c.nickname || [c.first_name, c.last_name].filter(Boolean).join(' '), colour: null, member_id: c.member_id })),
      pets: pets.results,
      projects: homes.results.filter((h) => h.kind === 'plan').map((h) => ({ id: h.id, title: h.title, color: h.color })),
      trips: trips.results,
    },
    history: ref ? await historyOf(db, hh, ref, today) : [],
  })
})
