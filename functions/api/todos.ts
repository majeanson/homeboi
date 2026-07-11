import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, localDayStart } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'

// À cocher — standalone check-off lists (todos), separate from the loose-chore
// "À faire" board section (`tasks` table + the board payload's `todos` field). A
// todo is GLOBAL (day NULL) or pinned to one calendar DAY. "Done" is a mark in
// place (done_at); "Effacer cochées" deletes the checked rows. Migration 0046.
//
// Two KINDS of row share the table (mig 0116): a LOOSE todo (« À compléter »,
// source_template_id NULL) and a departure CHECKLIST INSTANCE (« Avant de partir »,
// source_template_id = the todo_templates id it was instantiated from). An instance
// is ALWAYS day-pinned — a template POST without a day defaults to today rather than
// 400 (the offline outbox replays queued POSTs; a reject would strand them) — and
// past-day instances are swept opportunistically on the next write (never in GET:
// a guest GET must not write). A past day page may briefly show a stale instance
// until that write lands — invisible on the board, calm-acceptable.
//
//   GET    /api/todos            -> board glance: global + today's todos
//   GET    /api/todos?date=<sec> -> that day's todos
//   POST   /api/todos            -> add one { title, day? } OR instantiate a
//                                   template { templateId, day? } (day-pinned)
//   PATCH  /api/todos            -> toggle/edit { id, done? , title? } OR bulk
//                                   clear { clearChecked: true, ids? }
//   DELETE /api/todos            -> remove one { id }

interface TodoRow {
  id: string
  title: string
  day: number | null
  member_id: string | null
  done_at: number | null
  position: number
  section: string | null
  source_template_id: string | null
}

const COLS = 'id, title, day, member_id, done_at, position, section, source_template_id, created_at'

// The opportunistic roll-off: departure checklist instances pinned to a past day
// are finished business — delete them so no Tuesday list lingers into Thursday.
// Batched into EVERY write path (POST both branches, PATCH toggle + clearChecked,
// DELETE), never GET — a guest GET must not write. Cheap: the (household_id, day)
// index carries the range; source_template_id is a residual filter.
const sweepStale = (db: D1Database, householdId: string, today: number) =>
  db
    .prepare('DELETE FROM todos WHERE household_id = ? AND source_template_id IS NOT NULL AND day IS NOT NULL AND day < ?')
    .bind(householdId, today)

export const onRequestGet = authed(async (ctx, actor) => {
  const dateParam = new URL(ctx.request.url).searchParams.get('date')
  let rows
  if (dateParam !== null) {
    const day = Number(dateParam)
    if (!Number.isFinite(day)) return badRequest('date invalide.')
    rows = await ctx.env.DB.prepare(
      `SELECT ${COLS} FROM todos WHERE household_id = ? AND day = ? ORDER BY created_at, position`,
    )
      .bind(actor.householdId, day)
      .all<TodoRow>()
  } else {
    // Board glance: standing global todos (day IS NULL) plus today's per-day ones.
    const today = localDayStart(new Date())
    rows = await ctx.env.DB.prepare(
      `SELECT ${COLS} FROM todos WHERE household_id = ? AND (day IS NULL OR day = ?) ORDER BY created_at, position`,
    )
      .bind(actor.householdId, today)
      .all<TodoRow>()
  }
  return ok({ todos: rows.results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ title?: string; day?: number | null; templateId?: string }>(ctx.request)
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
      ).bind(newId(), actor.householdId, row.label.slice(0, 200), pinnedDay, mid, i, row.section, body.templateId, ts, ts),
    )
    stmts.push(sweepStale(ctx.env.DB, actor.householdId, today))
    await ctx.env.DB.batch(stmts)
    return ok({ ok: true, n: stmts.length - 1 })
  }

  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, source_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?, ?)',
    ).bind(id, actor.householdId, title.slice(0, 200), day, mid, ts, ts),
    sweepStale(ctx.env.DB, actor.householdId, today),
  ])
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; done?: boolean; title?: string; clearChecked?: boolean; ids?: unknown }>(
    ctx.request,
  )

  // Bulk "Effacer cochées" — delete the checked rows. Optional `ids` scopes the
  // clear to exactly the rows the UI ticked (so a check made after scheduling the
  // deferred undo isn't swept up); absent → every done row in the household.
  if (body?.clearChecked) {
    const today = localDayStart(new Date())
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : null
    if (ids && ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      await ctx.env.DB.batch([
        ctx.env.DB.prepare(`DELETE FROM todos WHERE household_id = ? AND id IN (${ph})`).bind(actor.householdId, ...ids),
        sweepStale(ctx.env.DB, actor.householdId, today),
      ])
    } else if (!ids) {
      await ctx.env.DB.batch([
        ctx.env.DB.prepare('DELETE FROM todos WHERE household_id = ? AND done_at IS NOT NULL').bind(actor.householdId),
        sweepStale(ctx.env.DB, actor.householdId, today),
      ])
    }
    return ok({ ok: true })
  }

  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const ts = nowSec()
  const today = localDayStart(new Date())
  // Toggle/rename ride the sweep too — checking a box is the household's most
  // frequent todos write, and without it a check-only household never sheds its
  // past-day instances ("every write path" must actually mean every write path).
  if (typeof body?.done === 'boolean') {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE todos SET done_at = ?, updated_at = ? WHERE id = ? AND household_id = ?').bind(
        body.done ? ts : null,
        ts,
        id,
        actor.householdId,
      ),
      sweepStale(ctx.env.DB, actor.householdId, today),
    ])
  }
  if (typeof body?.title === 'string' && body.title.trim()) {
    await ctx.env.DB.prepare('UPDATE todos SET title = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(body.title.trim().slice(0, 200), ts, id, actor.householdId)
      .run()
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM todos WHERE id = ? AND household_id = ?').bind(id, actor.householdId),
    sweepStale(ctx.env.DB, actor.householdId, localDayStart(new Date())),
  ])
  return ok({ ok: true })
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
