import { badRequest, notFound, ok, readJson, okWire } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, localDayStart, tickedAt } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'
import { deleteHealing } from '../_lib/staleDelete'
import { subjectBinds, validSubject } from '../_lib/subject'
import { todoRowsSql } from '../_lib/taskItem'
import { taskDay, taskDayOf } from '../_lib/taskDay'
import { insertTask } from '../_lib/taskWrite'
import { clearedRows, clearTasks, clearTaskStatements, tickTask, untickTask } from '../_lib/taskGestures'
import { emojiIcon, hexColorOrNull, taskEffort } from '../_lib/validate'

// À cocher — the departure checklists (« Avant de partir », mig 0116) and, as an alias, every
// task. Migration 0046.
//
// AN ALIAS since 0150, over TWO tables. A task lives on the spine (`home_projects`: its day in
// `at`, its tick in `last_done_at`). A departure CHECKLIST INSTANCE (source_template_id = the
// todo_templates id it was instantiated from) is not a task and stays in `todos`, with its own
// mark-in-place and its own « Vider », which DELETES (it is swept by day anyway). This endpoint
// keeps the shapes it always had — a queued offline write from yesterday's bundle or an old
// tab can still call it — by reading both through `todoRowsSql` and by writing an id to
// whichever table holds it (an UPDATE that matches nothing changes nothing; ids never collide
// across the two). Since 0153 a task's gestures here are the ones every task has
// (_lib/taskGestures): a tick records who did it, « Vider » stamps it out of the day and keeps
// it as history. A new loose row is a task, on the spine; the one form writes through /api/tasks.
//
// An instance is ALWAYS day-pinned — a template POST without a day defaults to today rather
// than 400 (the offline outbox replays queued POSTs; a reject would strand them) — and
// past-day instances are swept opportunistically on the next write (never in GET:
// a guest GET must not write). A past day page may briefly show a stale instance
// until that write lands — invisible on the board, calm-acceptable.
//
//   GET    /api/todos            -> board glance: global + today's todos
//   GET    /api/todos?date=<sec> -> that day's todos
//   POST   /api/todos            -> add one { title, day? } OR instantiate a
//                                   template { templateId, day? } (day-pinned)
//   PATCH  /api/todos            -> toggle/edit { id, done?, title?, day?, … } OR bulk
//                                   clear { clearChecked: true, ids? }
//   DELETE /api/todos            -> remove one { id }

// How long a todo's text may be, and how long the section header a checklist
// instance carries may be. Deliberately GENEROUS: a todo is often a whole
// sentence ("appeler la garderie pour le formulaire de Léa avant vendredi"), and
// the old 200-char cap cut the tail SILENTLY, after the save — the row simply
// came back shorter with nothing said. The client mirrors TITLE_MAX
// (src/lib/todos.ts TODO_TITLE_MAX) and now WARNS before sending, so these slices
// are a backstop against a legacy/hostile payload, not an everyday cut. SECTION_MAX
// must stay >= todo-templates.ts TEMPLATE_TITLE_MAX (the section IS that title).
const TITLE_MAX = 2000
const SECTION_MAX = 200

interface TodoRow {
  id: string
  title: string
  day: number | null
  member_id: string | null
  done_at: number | null
  position: number
  section: string | null
  source_template_id: string | null
  created_at: number
  subject_kind: string | null // soft ref (0146): what this task is about, no FK
  subject_id: string | null
  icon: string | null // 0148: the look's override; null = « comme le sujet »
  color: string | null // colour (0148), nullable, read as `color` like the two other faces
  effort: number | null // 0149: 1 to 5, null = not said
}

const COLS = 'id, title, day, member_id, done_at, position, section, source_template_id, created_at, subject_kind, subject_id, icon, colour AS color, effort'

// Reserved, non-template `source_template_id` for a FREE-TYPED « Avant de partir »
// item (typed into the departure card, not instantiated from a saved checklist). The
// sentinel makes it read as a checklist instance so it groups on the departure card,
// counts on its mini, folds into the Aujourd'hui glance, and is swept once its day
// passes. MIRRORED in src/lib/todos.ts — keep in lockstep.
const DEPARTURE_ADHOC = 'departure-adhoc'

// The opportunistic roll-off: departure checklist instances pinned to a past day
// are finished business — delete them so no Tuesday list lingers into Thursday.
// Batched into EVERY write path (POST both branches, PATCH toggle + clearChecked,
// DELETE), never GET — a guest GET must not write. Cheap: the (household_id, day)
// index carries the range; source_template_id is a residual filter.
const sweepStale = (db: D1Database, householdId: string, today: number) =>
  db
    .prepare('DELETE FROM todos WHERE household_id = ? AND source_template_id IS NOT NULL AND day IS NOT NULL AND day < ?')
    .bind(householdId, today)

// One change to one row, on whichever table holds it: the spine's spelling for a task (`at`,
// `last_done_at`), the old one for a departure instance. `sets` is written in the spine's
// column names; the departure side renames the two that differ.
function bothTables(db: D1Database, hh: string, id: string, sets: Record<string, unknown>, departureOnly?: string): D1PreparedStatement[] {
  const spineCols = Object.keys(sets)
  const oldName = (c: string) => (c === 'at' ? 'day' : c === 'last_done_at' ? 'done_at' : c)
  const vals = spineCols.map((c) => sets[c])
  return [
    db.prepare(`UPDATE home_projects SET ${spineCols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND household_id = ?`).bind(...vals, id, hh),
    db.prepare(`UPDATE todos SET ${spineCols.map((c) => `${oldName(c)} = ?`).join(', ')} WHERE id = ? AND household_id = ?${departureOnly ?? ''}`).bind(...vals, id, hh),
  ]
}

export const onRequestGet = authed(async (ctx, actor) => {
  const dateParam = new URL(ctx.request.url).searchParams.get('date')
  const today = localDayStart(new Date())
  let rows
  if (dateParam !== null) {
    const day = Number(dateParam)
    if (!Number.isFinite(day)) return badRequest('date invalide.')
    rows = await ctx.env.DB.prepare(todoRowsSql(COLS, 'WHERE day = ?2 ORDER BY created_at, position'))
      .bind(actor.householdId, day)
      .all<TodoRow>()
  } else {
    // Board glance: standing global todos (day IS NULL), today's per-day ones, AND
    // anything loose left OVERDUE on a past day.
    //
    // That last clause is the fix for a silent loss (bmad/11 tier-1 seam #3): a
    // to-do someone pinned to Tuesday was only ever selected by `day = today`, so
    // from Wednesday on it existed in the database and appeared NOWHERE — not on
    // the board, not in any glance, only on that one past day's page. It was never
    // swept either (the sweep above deliberately only removes checklist INSTANCES),
    // so it sat there, unfinished and invisible, forever.
    //
    // Deliberately narrow, and each condition earns its place:
    //   • `source_template_id IS NULL` — a stale « Avant de partir » instance is
    //     finished business and IS swept; only a hand-written to-do carries intent.
    //   • `done_at IS NULL` — a completed one is not owed.
    //   • `day IS NOT NULL` — globals are already covered by the first clause.
    // Nothing is rewritten and nothing is deleted: the row keeps its own day, and
    // the client shows it as overdue (the same treatment Entretien already gets).
    rows = await ctx.env.DB.prepare(
      todoRowsSql(
        COLS,
        `WHERE (day IS NULL
                OR day = ?2
                OR (day < ?2 AND day IS NOT NULL AND source_template_id IS NULL AND done_at IS NULL))
           AND NOT (day IS NULL AND done_at IS NOT NULL AND done_at < ?2 AND source_template_id IS NULL AND section IS NULL)
         ORDER BY created_at, position`,
      ),
    )
      .bind(actor.householdId, today)
      .all<TodoRow>()
    // The AND NOT is the merged board section: a standing to-do ticked on an earlier day has
    // CLEARED, on read, with no cron and no row rewrite (_lib/taskItem.ts). It stays in the
    // table as history. A legacy sectioned row keeps its old behaviour: it waits for
    // « Vider les cochés », see splitTodos. `done_at IS NOT NULL` is load-bearing: without it
    // an OPEN row reads NULL < ? = NULL, NOT NULL = NULL, and every open standing to-do
    // vanished from the board (caught in review, 2026-11-08; tasks.d1 holds it).
  }
  // A task's day, decoded (_lib/taskDay) until the nightly backfill has rewritten every row; a
  // departure instance's is already a local midnight and reads as itself.
  return okWire('todos', { todos: rows.results.map((r) => ({ ...r, day: taskDay(r.day) })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ title?: string; day?: number | null; templateId?: string; departure?: boolean; section?: string; subject?: unknown; icon?: unknown; color?: unknown; effort?: unknown }>(
    ctx.request,
  )
  const day = typeof body?.day === 'number' && Number.isFinite(body.day) ? body.day : null
  const mid = profileMemberId(ctx.request)
  const ts = nowSec()

  // Instantiate a template → a batch of real, independent CHECKLIST-INSTANCE todos
  // (the departure checklist made concrete; source_template_id marks each row, mig
  // 0116). Always DAY-PINNED: no day in the body → today, so a « global avant de
  // partir » cannot exist at the data level. The day is also FLOORED to today: a
  // past day would have the inserted rows match the sweep's `day < today` in this
  // very batch (insert-then-delete, a silent no-op), and an offline outbox POST
  // replayed after midnight would otherwise land on an already-gone day — leaving
  // the house is a today-or-later thing, so the floor is the honest semantic.
  // Every row carries `section` = the top template's title (plain or composed —
  // the departure card folds on it); a COMPOSED template (one that includes other
  // lists, at any depth) still flattens to that SINGLE section (deduped across the
  // whole result). Items keep their order via `position` (they share one
  // created_at, so position breaks the tie). Cycle-safe + capped. Mirrors
  // expandSectioned in src/lib/todos.ts.
  const today = localDayStart(new Date())
  if (body?.templateId) {
    const pinnedDay = Math.max(day ?? today, today)
    const rows = await ctx.env.DB.prepare('SELECT id, title, items_json FROM todo_templates WHERE household_id = ?')
      .bind(actor.householdId)
      .all<{ id: string; title: string; items_json: string }>()
    const tpls = new Map<string, { title: string; items: StoredItem[] }>()
    for (const r of rows.results) {
      let items: StoredItem[] = []
      try {
        const v = JSON.parse(r.items_json)
        if (Array.isArray(v)) items = v as StoredItem[]
      } catch {
        items = []
      }
      tpls.set(r.id, { title: r.title, items })
    }
    if (!tpls.has(body.templateId)) return badRequest('Modèle introuvable.')
    const rows2 = expandSectioned(tpls, body.templateId)
    if (rows2.length === 0) return ok({ ok: true, n: 0 })
    const stmts = rows2.map((row, i) =>
      ctx.env.DB.prepare(
        'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)',
      ).bind(newId(), actor.householdId, row.label.slice(0, TITLE_MAX), pinnedDay, mid, i, row.section, body.templateId, ts, ts),
    )
    stmts.push(sweepStale(ctx.env.DB, actor.householdId, today))
    await ctx.env.DB.batch(stmts)
    return ok({ ok: true, n: stmts.length - 1 })
  }

  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()

  // A FREE-TYPED « Avant de partir » item (no template): a checklist-type row for the
  // viewed day, FLOORED to today (leaving is a today-or-later thing, same reasoning as
  // an instantiated one — an offline replay after midnight must not land on a gone
  // day). The DEPARTURE_ADHOC sentinel + a shared `section` header make it group,
  // count and sweep exactly like an instantiated checklist row. Mirrors the tmpRow in
  // src/components/todos/TodoSection.tsx.
  if (body?.departure) {
    const pinnedDay = Math.max(day ?? today, today)
    const section = typeof body.section === 'string' && body.section.trim() ? body.section.trim().slice(0, SECTION_MAX) : null
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)',
      ).bind(id, actor.householdId, title.slice(0, TITLE_MAX), pinnedDay, mid, section, DEPARTURE_ADHOC, ts, ts),
      sweepStale(ctx.env.DB, actor.householdId, today),
    ])
    return ok({ ok: true, id })
  }

  // A loose row: a task, on the spine, through the one door every task is written by. Its
  // author (the acting profile) is `member_id`.
  await insertTask(ctx.env.DB, actor.householdId, { title, day, subject: body?.subject, icon: body?.icon, color: body?.color, effort: taskEffort(body?.effort) }, mid, { id, at: ts, title: title.slice(0, TITLE_MAX) })
  await sweepStale(ctx.env.DB, actor.householdId, today).run()
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; done?: boolean; doneAt?: unknown; title?: string; day?: unknown; subject?: unknown; icon?: unknown; color?: unknown; effort?: unknown; clearChecked?: boolean; ids?: unknown; items?: unknown; asOf?: unknown }>(
    ctx.request,
  )

  // Bulk "Effacer cochées". Optional `ids` scopes the clear to exactly the rows the UI ticked
  // (so a check made after scheduling the deferred undo isn't swept up); absent → every done
  // row in the household. A TASK is stamped out of the day and kept as history; a departure
  // instance is deleted, as it always was (its list is swept by day anyway).
  if (body?.clearChecked) {
    const today = localDayStart(new Date())
    const db = ctx.env.DB
    const hh = actor.householdId
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : null
    if (ids && ids.length > 0) {
      // The named ids, plus a stand-in for each one the database never had (a persisted
      // optimistic tmp- row, a frame older than a re-add): the DONE row of the same name that
      // already existed when the client ticked it (_lib/staleDelete.healClear). A stale
      // snapshot used to clear nothing and answer « ok »; if NOTHING is left to clear it is a
      // 404, so the client never trusts a clear that did not happen.
      const { results } = await db
        .prepare(todoRowsSql('id, title AS text, done_at, created_at, source_template_id IS NOT NULL OR section IS NOT NULL AS departure', ''))
        .bind(hh)
        .all<{ id: string; text: string; done_at: number | null; created_at: number; departure: number }>()
      const doomed = clearedRows(
        results.map((r) => ({ ...r, done: r.done_at !== null })),
        ids,
        body.items,
        body.asOf,
      )
      if (doomed.length === 0) return notFound('Aucune tâche à effacer.')
      const tasks = doomed.filter((r) => !r.departure).map((r) => r.id)
      const lists = doomed.filter((r) => r.departure).map((r) => r.id)
      const gone: D1PreparedStatement[] = []
      for (let i = 0; i < lists.length; i += 50) {
        const slice = lists.slice(i, i + 50)
        gone.push(db.prepare(`DELETE FROM todos WHERE household_id = ? AND id IN (${slice.map(() => '?').join(',')})`).bind(hh, ...slice))
      }
      await db.batch([...clearTaskStatements(db, hh, tasks, nowSec()), ...gone, sweepStale(db, hh, today)])
    } else if (!ids) {
      await clearTasks(db, hh, null, null, null)
      await db.batch([db.prepare('DELETE FROM todos WHERE household_id = ? AND done_at IS NOT NULL').bind(hh), sweepStale(db, hh, today)])
    }
    return ok({ ok: true })
  }

  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const ts = nowSec()
  const today = localDayStart(new Date())
  const db = ctx.env.DB
  const hh = actor.householdId
  // Toggle/rename ride the sweep too — checking a box is the household's most
  // frequent todos write, and without it a check-only household never sheds its
  // past-day instances ("every write path" must actually mean every write path).
  if (typeof body?.done === 'boolean') {
    // A task ticks the way every task does (_lib/taskGestures); a departure instance is a
    // mark in place on its own table.
    const onSpine = body.done
      ? (await tickTask(db, hh, id, { who: profileMemberId(ctx.request), at: tickedAt(body.doneAt, ts) })) != null
      : await untickTask(db, hh, id)
    const mark = onSpine ? [] : [db.prepare('UPDATE todos SET done_at = ?, updated_at = ? WHERE id = ? AND household_id = ?').bind(body.done ? tickedAt(body.doneAt, ts) : null, ts, id, hh)]
    await db.batch([...mark, sweepStale(db, hh, today)])
  }
  if (typeof body?.title === 'string' && body.title.trim()) {
    await db.batch(bothTables(db, hh, id, { title: body.title.trim().slice(0, TITLE_MAX), updated_at: ts }))
  }
  if (body?.subject !== undefined) {
    const [subjectKind, subjectId] = subjectBinds(await validSubject(db, hh, body.subject))
    await db.batch(bothTables(db, hh, id, { subject_kind: subjectKind, subject_id: subjectId, updated_at: ts }))
  }
  // The look (0148). Each half on its own: null puts the subject's back.
  if (body?.icon !== undefined || body?.color !== undefined) {
    const sets: Record<string, unknown> = {}
    if (body.icon !== undefined) sets.icon = emojiIcon(body.icon)
    if (body.color !== undefined) sets.colour = hexColorOrNull(body.color)
    await db.batch(bothTables(db, hh, id, { ...sets, updated_at: ts }))
  }
  // The day (phase 4, the one task form): a household-local midnight, or null for « un jour ».
  // Only a LOOSE to-do moves: a departure instance's day is what sweeps it, so it keeps its own.
  if (body?.day !== undefined) {
    await db.batch(bothTables(db, hh, id, { at: taskDayOf(body.day), updated_at: ts }, ' AND source_template_id IS NULL'))
  }
  // The effort (0149): null, or anything that is not a dot from 1 to 5, clears it.
  if (body?.effort !== undefined) {
    await db.batch(bothTables(db, hh, id, { effort: taskEffort(body.effort), updated_at: ts }))
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; text?: string; asOf?: number }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Optimistic rows exist here too (TodoSection mints tmp- ids), so a vacuous « ok » on
  // an id the DB never had would let the row come back — see _lib/staleDelete, which reads
  // and deletes across both tables a to-do may live in.
  const r = await deleteHealing(ctx.env.DB, {
    table: 'todos',
    textColumn: 'title',
    householdId: actor.householdId,
    id,
    text: body?.text,
    asOf: body?.asOf,
  })
  await sweepStale(ctx.env.DB, actor.householdId, localDayStart(new Date())).run()
  if (r.outcome === 'missing') return notFound('Tâche introuvable.')
  return ok(r.outcome === 'healed' ? { ok: true, healed: r.id } : { ok: true })
})

// ── Template composition (server mirror of src/lib/todos.ts) ──────────────────
// Kept in lockstep with the client expansion so the editor's count preview and
// the instantiated rows agree. Operates on the compact STORED item form (a bare
// string label, or { ref } / { label }), not the API's normalized union.
type StoredItem = string | { ref?: string; label?: string }
type Tpls = Map<string, { title: string; items: StoredItem[] }>
const MAX_EXPAND = 100
const normLabel = (s: string) => s.trim().toLowerCase()

// Flatten ONE list's tree into labels: refs inline, each list visited once
// (cycle-safe), labels deduped case-insensitively within the result.
function flattenList(tpls: Tpls, id: string, max: number): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  const walk = (tid: string) => {
    if (seen.has(tid) || labels.length >= max) return
    seen.add(tid)
    for (const it of tpls.get(tid)?.items ?? []) {
      if (labels.length >= max) break
      if (typeof it === 'string') {
        const s = it.trim()
        if (s) labels.push(s)
      } else if (it && typeof it.ref === 'string' && it.ref.trim()) {
        walk(it.ref.trim())
      } else if (it && typeof it.label === 'string' && it.label.trim()) {
        labels.push(it.label.trim())
      }
    }
  }
  walk(id)
  const seenLabel = new Set<string>()
  const out: string[] = []
  for (const l of labels) {
    const k = normLabel(l)
    if (!k || seenLabel.has(k)) continue
    seenLabel.add(k)
    out.push(l)
  }
  return out.slice(0, max)
}

// The instantiated, SECTIONED result. We always want the TOP parent and all its
// todos: EVERY instantiation (plain or composed) carries `section` = the top list's
// title — the departure card folds each instance under that header, so it must always
// exist (mig 0116; previously composed-only). A COMPOSED list (one containing any
// sub-list ref, at any depth) still flattens to that SINGLE section — every label,
// loose or from a nested sub-list, under one header (deduped across the whole
// result). Intermediate sub-list titles are not shown.
function expandSectioned(tpls: Tpls, id: string, max = MAX_EXPAND): { label: string; section: string | null }[] {
  const root = tpls.get(id)
  if (!root) return []
  const section = root.title
  return flattenList(tpls, id, max).map((label) => ({ label, section }))
}
