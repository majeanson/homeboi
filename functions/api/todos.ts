import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, localDayStart } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'

// À cocher — standalone check-off lists (todos), separate from the loose-chore
// "À faire" board section (`tasks` table + the board payload's `todos` field). A
// todo is GLOBAL (day NULL) or pinned to one calendar DAY. "Done" is a mark in
// place (done_at); "Effacer cochées" deletes the checked rows. Migration 0046.
//
//   GET    /api/todos            -> board glance: global + today's todos
//   GET    /api/todos?date=<sec> -> that day's todos
//   POST   /api/todos            -> add one { title, day? } OR instantiate a
//                                   template { templateId, day? }
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
}

const COLS = 'id, title, day, member_id, done_at, position, section, created_at'

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

  // Instantiate a template → a batch of real, independent todos (the departure
  // checklist made concrete). A COMPOSED template (one that includes other lists)
  // flattens to a SECTIONED list: each included sub-list's items land under that
  // sub-list's title as their `section`; loose items have no section. The same
  // label from two sub-lists is kept in both (attributed to each source). Items
  // keep their order via `position` (they share one created_at, so position breaks
  // the tie). Cycle-safe + capped. Mirrors expandSectioned in src/lib/todos.ts.
  if (body?.templateId) {
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
        'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
      ).bind(newId(), actor.householdId, row.label.slice(0, 200), day, mid, i, row.section, ts, ts),
    )
    await ctx.env.DB.batch(stmts)
    return ok({ ok: true, n: stmts.length })
  }

  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, section, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)',
  )
    .bind(id, actor.householdId, title.slice(0, 200), day, mid, ts, ts)
    .run()
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
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : null
    if (ids && ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      await ctx.env.DB.prepare(`DELETE FROM todos WHERE household_id = ? AND id IN (${ph})`)
        .bind(actor.householdId, ...ids)
        .run()
    } else if (!ids) {
      await ctx.env.DB.prepare('DELETE FROM todos WHERE household_id = ? AND done_at IS NOT NULL')
        .bind(actor.householdId)
        .run()
    }
    return ok({ ok: true })
  }

  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const ts = nowSec()
  if (typeof body?.done === 'boolean') {
    await ctx.env.DB.prepare('UPDATE todos SET done_at = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(body.done ? ts : null, ts, id, actor.householdId)
      .run()
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
  await ctx.env.DB.prepare('DELETE FROM todos WHERE id = ? AND household_id = ?').bind(id, actor.householdId).run()
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

// The instantiated, SECTIONED result: loose items → section null (deduped among
// loose); a ref → the referenced list's flattened labels under that list's title.
// The same label from two different sub-lists is kept in BOTH sections.
function expandSectioned(tpls: Tpls, id: string, max = MAX_EXPAND): { label: string; section: string | null }[] {
  const root = tpls.get(id)
  if (!root) return []
  const out: { label: string; section: string | null }[] = []
  const looseSeen = new Set<string>()
  const pushLoose = (raw: string) => {
    const s = raw.trim()
    if (!s) return
    const k = normLabel(s)
    if (looseSeen.has(k)) return
    looseSeen.add(k)
    out.push({ label: s, section: null })
  }
  for (const it of root.items) {
    if (out.length >= max) break
    if (typeof it === 'string') {
      pushLoose(it)
    } else if (it && typeof it.ref === 'string' && it.ref.trim()) {
      const refId = it.ref.trim()
      const ref = tpls.get(refId)
      if (!ref) continue
      for (const label of flattenList(tpls, refId, max - out.length)) {
        if (out.length >= max) break
        out.push({ label, section: ref.title })
      }
    } else if (it && typeof it.label === 'string') {
      pushLoose(it.label)
    }
  }
  return out
}
