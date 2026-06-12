import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { normalizeItem } from '../_lib/normalize'
import { profileMemberId } from '../_lib/profile'

// Shared list: ONE active list. Read, add, toggle a check (a mark — the item
// stays put), clear the checked ones (logs the buy + deletes), delete a line.
// Both operator and kiosk can write — ticking a grocery item is exactly what the
// wall tablet is for. No score for clearing items (NFR-CALM): done is just done.
export const onRequestGet = authed(async (ctx, actor) => {
  // ?view=history → everything this household has ever put on the list, deduped,
  // newest first, each carrying the latest flyer synonyms it was bought with.
  // Feeds the quick-add panel (and re-adds an item with the same search terms).
  // Two sources merged: purchase_log (long-term, survives the clear) and
  // list_items (catches lines added but never bought yet).
  if (new URL(ctx.request.url).searchParams.get('view') === 'history') {
    const [bought, added, terms] = await Promise.all([
      ctx.env.DB.prepare(
        'SELECT item_key AS key, text, COUNT(*) AS count, MAX(purchased_at) AS last_at FROM purchase_log WHERE household_id = ? GROUP BY item_key',
      )
        .bind(actor.householdId)
        .all<{ key: string; text: string; count: number; last_at: number }>(),
      ctx.env.DB.prepare(
        'SELECT text, search_terms, MAX(created_at) AS last_at FROM list_items WHERE household_id = ? GROUP BY text',
      )
        .bind(actor.householdId)
        .all<{ text: string; search_terms: string | null; last_at: number }>(),
      // Latest non-null synonyms per item, newest first — first seen per key wins.
      ctx.env.DB.prepare(
        'SELECT item_key, search_terms FROM purchase_log WHERE household_id = ? AND search_terms IS NOT NULL ORDER BY purchased_at DESC',
      )
        .bind(actor.householdId)
        .all<{ item_key: string; search_terms: string }>(),
    ])
    const termsByKey = new Map<string, string>()
    for (const r of terms.results) if (!termsByKey.has(r.item_key)) termsByKey.set(r.item_key, r.search_terms)
    const byKey = new Map<string, { key: string; text: string; count: number; lastAt: number; searchTerms: string | null }>()
    for (const r of bought.results)
      byKey.set(r.key, { key: r.key, text: r.text, count: r.count, lastAt: r.last_at, searchTerms: termsByKey.get(r.key) ?? null })
    for (const r of added.results) {
      const key = normalizeItem(r.text)
      if (!key) continue
      const seen = byKey.get(key)
      if (!seen)
        byKey.set(key, { key, text: r.text, count: 0, lastAt: r.last_at, searchTerms: r.search_terms ?? termsByKey.get(key) ?? null })
      else {
        // A still-open line's own synonyms are the freshest source for the key.
        if (r.search_terms && !termsByKey.has(key)) seen.searchTerms = r.search_terms
        if (r.last_at > seen.lastAt) {
          seen.lastAt = r.last_at
          seen.text = r.text
        }
      }
    }
    const items = [...byKey.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 80)
    return ok({ items })
  }

  // The whole active list — unchecked AND checked. A check is a mark, not a move:
  // checked items stay in place (struck through) until "Clear checked" removes them.
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, text, source, added_by, deal_json, search_terms, checked_at FROM list_items WHERE household_id = ? ORDER BY created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ items: results })
})

// Normalize an incoming synonyms value to a stored JSON array (or null): trimmed,
// de-blanked, capped at 12 — same shape the PATCH and the deals lookup expect.
function termsJson(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const terms = value.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
  return terms.length ? JSON.stringify(terms) : null
}

export const onRequestPost = authed(async (ctx, actor) => {
  // `deal` optionally stages a flyer deal onto the new line (the cashier set lives
  // on the list now) — stored as JSON; absent for an ordinary grocery item.
  // `search_terms` lets the quick-add panel restock an item with the flyer
  // synonyms it carried last time (a JSON array of strings), so re-adding "Pain"
  // keeps "baguette/bread" without retyping.
  const body = await readJson<{ text?: string; deal?: unknown; search_terms?: unknown }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Texte requis.')
  const id = newId()
  const dealJson = body?.deal ? JSON.stringify(body.deal) : null
  const searchTerms = termsJson(body?.search_terms)
  await ctx.env.DB.prepare(
    'INSERT INTO list_items (id, household_id, text, source, added_by, deal_json, search_terms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text, 'manual', profileMemberId(ctx.request), dealJson, searchTerms, nowSec())
    .run()
  return ok({ id, text })
})

// PATCH toggles checked; DELETE removes. Scoped to the household so a kiosk
// can't touch another household's rows even with a forged id.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    checked?: boolean
    deal?: unknown
    text?: string
    search_terms?: unknown
    clearChecked?: boolean
    ids?: unknown
  }>(ctx.request)

  // Clear checked (no id): every checked line is a confirmed buy now — log each to
  // purchase_log (carrying its synonyms, so a re-add keeps them) then delete it, in
  // one batch. This is the ONLY place a purchase is recorded: checking is just a
  // mark, so an item ticked then unticked (out of stock) never skews predictions.
  // `ids` (optional) restricts the clear to a known snapshot — the undo toast
  // passes exactly the rows it showed, so a check made after scheduling the undo
  // is NOT swept up by the commit.
  if (body?.clearChecked) {
    const restrict = Array.isArray(body.ids) ? new Set(body.ids.map((x) => String(x))) : null
    const { results: all } = await ctx.env.DB.prepare(
      'SELECT id, text, search_terms FROM list_items WHERE household_id = ? AND checked_at IS NOT NULL',
    )
      .bind(actor.householdId)
      .all<{ id: string; text: string; search_terms: string | null }>()
    const results = restrict ? all.filter((r) => restrict.has(r.id)) : all
    if (results.length === 0) return ok({ ok: true, cleared: 0 })
    const ts = nowSec()
    const writes = []
    for (const row of results) {
      const key = normalizeItem(row.text)
      if (key)
        writes.push(
          ctx.env.DB.prepare(
            'INSERT INTO purchase_log (id, household_id, item_key, text, search_terms, purchased_at) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(newId(), actor.householdId, key, row.text, row.search_terms, ts),
        )
      writes.push(
        ctx.env.DB.prepare('DELETE FROM list_items WHERE id = ? AND household_id = ?').bind(row.id, actor.householdId),
      )
    }
    await ctx.env.DB.batch(writes)
    return ok({ ok: true, cleared: results.length })
  }

  if (!body?.id) return badRequest('id requis.')

  // Rename the line in place (edit sheet). Trimmed; empty text is ignored rather
  // than blanking the row.
  if (typeof body.text === 'string') {
    const text = body.text.trim()
    if (!text) return badRequest('Texte requis.')
    await ctx.env.DB.prepare('UPDATE list_items SET text = ? WHERE id = ? AND household_id = ?')
      .bind(text, body.id, actor.householdId)
      .run()
  }

  // Extra flyer search synonyms for this line (edit sheet) — a JSON array of
  // strings, or null/[] to clear. Stored as JSON; the deals endpoint fans these
  // out across Flipp so "Œuf" can also match "egg"/"oeufs".
  if ('search_terms' in body) {
    await ctx.env.DB.prepare('UPDATE list_items SET search_terms = ? WHERE id = ? AND household_id = ?')
      .bind(termsJson(body.search_terms), body.id, actor.householdId)
      .run()
  }

  // Stage / unstage a flyer deal on this line — `deal` present (object → stage,
  // null → unstage) updates deal_json. This is how the cashier set is built now.
  if ('deal' in body) {
    const dealJson = body.deal ? JSON.stringify(body.deal) : null
    await ctx.env.DB.prepare('UPDATE list_items SET deal_json = ? WHERE id = ? AND household_id = ?')
      .bind(dealJson, body.id, actor.householdId)
      .run()
  }

  // Checking is a MARK, not a buy: the item stays on the list (struck through) so
  // a shopper can tick what's in the cart and leave what's out of stock. We just
  // stamp/clear checked_at; tapping again unchecks. The purchase is only recorded
  // later, when "Clear checked" removes the line (see the clearChecked branch),
  // so a tick-then-untick never skews the ghost predictions.
  if (typeof body.checked === 'boolean') {
    await ctx.env.DB.prepare('UPDATE list_items SET checked_at = ? WHERE id = ? AND household_id = ?')
      .bind(body.checked ? nowSec() : null, body.id, actor.householdId)
      .run()
  }
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM list_items WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
