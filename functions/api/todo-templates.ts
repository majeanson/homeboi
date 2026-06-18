import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// Reusable check-off checklists ("Avant de partir", "Chez grand-papa"): a title +
// an ordered list of item labels. Instantiating one (POST /api/todos
// { templateId }) drops its items in as real todos — see functions/api/todos.ts.
// Migration 0046. Operator-managed in Réglages ▸ À cocher.
//
//   GET    /api/todo-templates  -> all templates (with parsed items[])
//   POST   /api/todo-templates  -> create { title, items? }
//   PATCH  /api/todo-templates  -> update { id, title?, items? }
//   DELETE /api/todo-templates  -> remove { id }

interface TplRow {
  id: string
  title: string
  items_json: string
  position: number
}

// The normalized item form the API serves (mirrors src/lib/todos.ts TemplateItem):
// a plain label, or a reference to another template.
type ApiItem = { kind: 'item'; label: string } | { kind: 'ref'; refId: string }

// Parse the compact stored items_json (string | { ref } | { label }) into the
// normalized union, dropping anything malformed.
function parseItems(json: string): ApiItem[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: ApiItem[] = []
  for (const x of raw) {
    if (typeof x === 'string') {
      const s = x.trim()
      if (s) out.push({ kind: 'item', label: s })
    } else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      if (typeof o.ref === 'string' && o.ref.trim()) out.push({ kind: 'ref', refId: o.ref.trim() })
      else if (typeof o.label === 'string' && o.label.trim()) out.push({ kind: 'item', label: o.label.trim() })
    }
  }
  return out
}

// Sanitize the wire items (string | { ref } | { label }) into the compact STORED
// form (string | { ref }), trimming + capping. A ref is kept as an id — its
// existence is only checked at instantiation (a deleted ref is skipped then).
function sanitizeItems(items: unknown): (string | { ref: string })[] {
  if (!Array.isArray(items)) return []
  const out: (string | { ref: string })[] = []
  for (const x of items) {
    if (out.length >= 50) break
    if (typeof x === 'string') {
      const s = x.trim()
      if (s) out.push(s.slice(0, 200))
    } else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      if (typeof o.ref === 'string' && o.ref.trim()) out.push({ ref: o.ref.trim().slice(0, 32) })
      else if (typeof o.label === 'string' && o.label.trim()) out.push(o.label.trim().slice(0, 200))
    }
  }
  return out
}

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, title, items_json, position FROM todo_templates WHERE household_id = ? ORDER BY position, title',
  )
    .bind(actor.householdId)
    .all<TplRow>()
  const templates = rows.results.map((r) => ({
    id: r.id,
    title: r.title,
    position: r.position,
    items: parseItems(r.items_json),
  }))
  return ok({ templates })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ title?: string; items?: unknown }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO todo_templates (id, household_id, title, items_json, position, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
  )
    .bind(id, actor.householdId, title.slice(0, 80), JSON.stringify(sanitizeItems(body?.items)), ts, ts)
    .run()
  return ok({ ok: true, id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; title?: string; items?: unknown }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const ts = nowSec()
  if (typeof body?.title === 'string' && body.title.trim()) {
    await ctx.env.DB.prepare('UPDATE todo_templates SET title = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(body.title.trim().slice(0, 80), ts, id, actor.householdId)
      .run()
  }
  // `items` is replace-the-whole-array (the form owns the ordered list).
  if (body && 'items' in body) {
    await ctx.env.DB.prepare('UPDATE todo_templates SET items_json = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(JSON.stringify(sanitizeItems(body.items)), ts, id, actor.householdId)
      .run()
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM todo_templates WHERE id = ? AND household_id = ?')
    .bind(id, actor.householdId)
    .run()
  return ok({ ok: true })
})
