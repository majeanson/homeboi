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
}

const COLS = 'id, title, day, member_id, done_at, position, created_at'

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
  // checklist made concrete). Items keep their template order via `position`
  // (they share one created_at, so position breaks the tie). Capped, defensively.
  if (body?.templateId) {
    const tpl = await ctx.env.DB.prepare('SELECT items_json FROM todo_templates WHERE id = ? AND household_id = ?')
      .bind(body.templateId, actor.householdId)
      .first<{ items_json: string }>()
    if (!tpl) return badRequest('Modèle introuvable.')
    let items: string[] = []
    try {
      const v = JSON.parse(tpl.items_json)
      if (Array.isArray(v)) items = v.filter((x): x is string => typeof x === 'string' && !!x.trim())
    } catch {
      items = []
    }
    if (items.length === 0) return ok({ ok: true, n: 0 })
    const stmts = items.slice(0, 50).map((label, i) =>
      ctx.env.DB.prepare(
        'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
      ).bind(newId(), actor.householdId, label.trim().slice(0, 200), day, mid, i, ts, ts),
    )
    await ctx.env.DB.batch(stmts)
    return ok({ ok: true, n: stmts.length })
  }

  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO todos (id, household_id, title, day, member_id, position, done_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)',
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
