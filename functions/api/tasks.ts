import { badRequest, notFound, ok, okWire, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { parseSubject, validSubject, type SubjectRef } from '../_lib/subject'
import {
  CHORE_TASK_COLS,
  FACE,
  HOME_TASK_COLS,
  choreTask,
  deleteTaskStatements,
  faceOfKind,
  homeTask,
  present,
  todoRowsSql,
  todoTask,
  type ChoreTaskRow,
  type Face,
  type HomeTaskRow,
  type TodoTaskRow,
} from '../_lib/taskItem'
import { bodyAxes, faceColumns, homeKind, type TaskBody } from '../_lib/taskWrite'
import { faceAfter, taskTarget } from '../../src/lib/taskTarget'
import type { TasksWire } from '../_lib/wire'

// /api/tasks — the household's tasks as ONE list, and the one form's door.
//
// GET: every task, for the « Tâches » board view and a subject's page. Cold path on purpose: it
// is read when one of those opens and refreshed by a realtime nudge, never polled. The bento
// board does NOT read this: it stays on /api/board + /api/todos, because the board is the
// free-tier lever (`board-poll.test.ts`).
//
// `subjects` carries the small rows `subjectOf()` needs to name what a task is about, in one
// round trip, so a view of the household's tasks needs no second fetch per kind.
//
// `?subject=<kind>:<id>` adds that subject's `history`: what was done, when, and by whom.
// Names and dates, newest first, never a count or a total (NFR-CALM-1). It reads the rows
// that are already there: a chore's contribution log, a project's last completion, and the
// to-dos whose day has passed, which is exactly what the end-of-day clear leaves behind.
//
// POST / PATCH / DELETE (0150): the one task form writes here, in ONE spelling of every layer
// (lib/taskSave.ts), and never names a face. The server picks it with the shared rule
// (src/lib/taskTarget.ts): `taskTarget` for a new task, `faceAfter` for an edit, which keeps
// the row's face while it shows every layer and moves it up otherwise, on the same id. A row's
// tick, untick, « Reporter » and « Vider » still go to its face's alias (chores, todos,
// home-projects), which keep the semantics they always had.
const HISTORY_MAX = 30
// A backstop, not a page size: a household holds a few dozen tasks, and the read is cold.
const ROWS_MAX = 500
const TITLE_MAX = 2000

async function historyOf(db: D1Database, hh: string, ref: SubjectRef, today: number): Promise<TasksWire['history']> {
  // A carnet on a home row lives in carnet_id (migration 0146).
  const homeMatch = ref.kind === 'carnet' ? 'carnet_id = ?' : 'subject_kind = ? AND subject_id = ?'
  const homeBinds = ref.kind === 'carnet' ? [ref.id] : [ref.kind, ref.id]
  const [chores, homes, todos] = await Promise.all([
    db
      .prepare(
        `SELECT t.id, t.title, tp.contributed_at AS at, tp.member_id AS who_id
           FROM task_participants tp
           JOIN home_projects t ON t.id = tp.task_id AND t.household_id = ? AND t.${FACE.chore}
          WHERE t.subject_kind = ? AND t.subject_id = ?
          ORDER BY tp.contributed_at DESC LIMIT ?`,
      )
      .bind(hh, ref.kind, ref.id, HISTORY_MAX)
      .all<{ id: string; title: string; at: number; who_id: string | null }>(),
    db
      .prepare(
        `SELECT id, title, last_done_at AS at, last_done_by AS who_id FROM home_projects WHERE household_id = ? AND ${FACE.home} AND last_done_at IS NOT NULL AND ${homeMatch} ORDER BY last_done_at DESC LIMIT ?`,
      )
      .bind(hh, ...homeBinds, HISTORY_MAX)
      .all<{ id: string; title: string; at: number; who_id: string | null }>(),
    db
      .prepare(
        todoRowsSql(
          'id, title, done_at AS at, member_id AS who_id',
          'WHERE subject_kind = ?2 AND subject_id = ?3 AND done_at IS NOT NULL AND done_at < ?4 ORDER BY done_at DESC LIMIT ?5',
        ),
      )
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
    db.prepare(`SELECT ${CHORE_TASK_COLS} FROM home_projects WHERE household_id = ? AND ${FACE.chore} ORDER BY created_at LIMIT ?`).bind(hh, ROWS_MAX).all<ChoreTaskRow>(),
    db.prepare(`SELECT ${HOME_TASK_COLS} FROM home_projects WHERE household_id = ? AND ${FACE.home} ORDER BY created_at LIMIT ?`).bind(hh, ROWS_MAX).all<HomeTaskRow>(),
    // Loose rows only, and only what has not cleared. A departure instance is not a task.
    db
      .prepare(
        todoRowsSql(
          'id, title, day, member_id, done_at, section, source_template_id, subject_kind, subject_id, icon, colour AS color, effort',
          'WHERE source_template_id IS NULL AND section IS NULL AND (done_at IS NULL OR done_at >= ?2) ORDER BY created_at, position LIMIT ?3',
        ),
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
    db
      .prepare('SELECT id, name, colour, icon FROM pets WHERE household_id = ? AND deleted_at IS NULL ORDER BY name LIMIT ?')
      .bind(hh, ROWS_MAX)
      .all<{ id: string; name: string; colour: string | null; icon: string | null }>(),
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
      projects: homes.results.filter((h) => h.kind === 'plan').map((h) => ({ id: h.id, title: h.title, color: h.color, icon: h.icon })),
      trips: trips.results,
    },
    history: ref ? await historyOf(db, hh, ref, today) : [],
  })
})

// The `kind` a face is stored as. A home row's kind comes from a door, else from its schedule
// (a recurrence is upkeep, a one-off is a project), the rule the form always had.
const kindFor = (face: Face, b: TaskBody, axes: ReturnType<typeof bodyAxes>): string =>
  face === 'home' ? homeKind(b.kind ?? (axes.recur ? 'upkeep' : 'plan')) : face

export const onRequestPost = authed(async (ctx, actor) => {
  const body = (await readJson<TaskBody>(ctx.request)) ?? {}
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, TITLE_MAX) : ''
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  const axes = bodyAxes(body)
  const face = taskTarget(axes)
  const ref = await validSubject(ctx.env.DB, actor.householdId, body.subject, id)
  const cols: Record<string, unknown> = {
    id,
    household_id: actor.householdId,
    kind: kindFor(face, body, axes),
    title,
    ...faceColumns(face, body, ref),
    // A to-do's author is the acting profile, as POST /api/todos has always stamped it.
    member_id: face === 'todo' ? profileMemberId(ctx.request) : null,
    created_at: ts,
    updated_at: ts,
  }
  const names = Object.keys(cols)
  await ctx.env.DB.prepare(`INSERT INTO home_projects (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .bind(...names.map((n) => cols[n]))
    .run()
  return ok({ id, title, face })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = (await readJson<TaskBody & { id?: unknown }>(ctx.request)) ?? {}
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare('SELECT kind FROM home_projects WHERE id = ? AND household_id = ?')
    .bind(id, actor.householdId)
    .first<{ kind: string }>()
  if (!row) return notFound('Tâche introuvable.')
  const axes = bodyAxes(body)
  const current = faceOfKind(row.kind)
  const face = faceAfter(current, axes)
  const ref = await validSubject(ctx.env.DB, actor.householdId, body.subject, id)
  const sets: Record<string, unknown> = { ...faceColumns(face, body, ref), updated_at: nowSec() }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, TITLE_MAX) : ''
  if (title) sets.title = title
  // A home row keeps its kind (a project stays a project); a row that moves up takes its new one.
  if (face !== current) sets.kind = kindFor(face, body, axes)
  const names = Object.keys(sets)
  await ctx.env.DB.prepare(`UPDATE home_projects SET ${names.map((n) => `${n} = ?`).join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...names.map((n) => sets[n]), id, actor.householdId)
    .run()
  return ok({ ok: true, face })
})

// The one form's « Annuler » on a create, and a delete from the form: any face, with its log.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: unknown }>(ctx.request)
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!id) return badRequest('id requis.')
  await ctx.env.DB.batch(deleteTaskStatements(ctx.env.DB, actor.householdId, id))
  return ok({ ok: true })
})
