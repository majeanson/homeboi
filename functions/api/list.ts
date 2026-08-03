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
    // Hand order first (position 0..n), then anything never dragged by created_at +
    // id — a stable total order, so same-second rows (quick-add) keep a fixed slot
    // instead of reshuffling on each read. Mirror of the board read, which is the
    // list the Liste page actually renders.
    'SELECT id, text, source, added_by, deal_json, search_terms, checked_at, non_urgent FROM list_items WHERE household_id = ? ORDER BY position IS NULL, position, created_at, id',
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

// --- Where a « pas pressé » line sits (mirrors src/lib/listOrder.ts) -----------
// A « pas pressé » line is only bought if an aubaine is on, so it settles at the
// BOTTOM of the hand order: a new line lands ABOVE the flagged block, and flipping
// the flag on drops that row to the end. Only the TRAILING run of flagged rows
// counts — a flagged row a shopper dragged back up into the errands is a deliberate
// choice ("Mon ordre" wins) and is never reclaimed.

// The list in the exact order every read sorts it (hand order, then never-dragged).
async function orderedRows(db: D1Database, householdId: string) {
  const { results } = await db
    .prepare('SELECT id, non_urgent FROM list_items WHERE household_id = ? ORDER BY position IS NULL, position, created_at, id')
    .bind(householdId)
    .all<{ id: string; non_urgent: number | null }>()
  return results
}

// The index where the trailing run of flagged rows begins (= rows.length when the
// last row is an ordinary errand).
function noRushStart(rows: { non_urgent: number | null }[]): number {
  let i = rows.length
  while (i > 0 && rows[i - 1].non_urgent) i--
  return i
}

// Slot `id` where the « pas pressé » rule wants it and renumber position 0..n.
// `where`: 'bottom' = the very end (a line just flagged); 'lastErrand' = just above
// the trailing flagged block (a new line, or a line just un-flagged). A no-op when
// the row already sits there — an ordinary household never has a flagged line, so
// this costs one SELECT and writes nothing, leaving position NULL as before.
async function settle(db: D1Database, householdId: string, id: string, where: 'bottom' | 'lastErrand') {
  const rows = await orderedRows(db, householdId)
  const rest = rows.filter((r) => r.id !== id)
  const ids = rest.map((r) => r.id)
  ids.splice(where === 'bottom' ? ids.length : noRushStart(rest), 0, id)
  if (ids.every((x, i) => rows[i]?.id === x)) return
  await db.batch(
    ids.map((rowId, i) =>
      db.prepare('UPDATE list_items SET position = ? WHERE id = ? AND household_id = ?').bind(i, rowId, householdId),
    ),
  )
}

// Crude per-word singular fold, mirror of src/lib/picks.tsx: « pommes » still
// finds « Pomme Gala 3 lb ». Trailing 's' on 4+ letter words only.
function singularWords(key: string): string {
  return key
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ')
}

// Does an existing line answer for this (flyer) name? Exact normalized name, exact
// synonym, or the LINE's generic name contained whole-word in the specific product
// name (one direction only — mirror of matchListItem's tiers 1–4, flattened; the
// tier preference is approximated by the caller's open-before-checked ordering).
function lineMatches(dealKey: string, line: { text: string; search_terms: string | null }): boolean {
  const hay = ` ${singularWords(dealKey)} `
  let terms: string[] = []
  try {
    const a = line.search_terms ? JSON.parse(line.search_terms) : []
    terms = Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch {
    /* malformed synonyms — match on the name alone */
  }
  return [normalizeItem(line.text), ...terms.map(normalizeItem)].some(
    (k) => !!k && (k === dealKey || (k.length >= 3 && hay.includes(` ${singularWords(k)} `))),
  )
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
  // Deal ↔ item backstop for a cold client cache: a deal-carrying add whose name
  // already matches a line rides on THAT line (unchecked if it was ticked) instead
  // of inserting a specific-named duplicate that loses the line's saved synonyms.
  // Deal adds only — a plain POST may be a deliberate second line ("pommes" twice
  // before a big party is the household's call, not ours).
  if (dealJson) {
    const dealKey = normalizeItem(text)
    if (dealKey) {
      const { results } = await ctx.env.DB.prepare(
        // Open lines first, so a still-to-buy line wins over a ticked twin.
        'SELECT id, text, search_terms FROM list_items WHERE household_id = ? ORDER BY checked_at IS NOT NULL, created_at',
      )
        .bind(actor.householdId)
        .all<{ id: string; text: string; search_terms: string | null }>()
      const hit = results.find((r) => lineMatches(dealKey, r))
      if (hit) {
        await ctx.env.DB.prepare('UPDATE list_items SET deal_json = ?, checked_at = NULL WHERE id = ? AND household_id = ?')
          .bind(dealJson, hit.id, actor.householdId)
          .run()
        return ok({ id: hit.id, text: hit.text })
      }
    }
  }
  await ctx.env.DB.prepare(
    'INSERT INTO list_items (id, household_id, text, source, added_by, deal_json, search_terms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text, 'manual', profileMemberId(ctx.request), dealJson, searchTerms, nowSec())
    .run()
  // A new line is a real errand: it lands at the end of the errands, ABOVE any
  // « pas pressé » block rather than under it.
  await settle(ctx.env.DB, actor.householdId, id, 'lastErrand')
  return ok({ id, text })
})

// PATCH toggles checked; DELETE removes. Scoped to the household so a kiosk
// can't touch another household's rows even with a forged id.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    checked?: boolean
    non_urgent?: boolean
    deal?: unknown
    text?: string
    search_terms?: unknown
    clearChecked?: boolean
    ids?: unknown
    reorder?: unknown // a full ordered array of list_item ids (drag-and-drop)
    historyKey?: string // a purchase_log item_key to rename (Réglages cleanup)
    renameTo?: string // the generic name to fold that key into
  }>(ctx.request)

  // Drag-and-drop reorder: the client sends the list ids in their new order. Write
  // position 0..n across them (household-scoped, so a forged id can't touch another
  // home's rows). After this every row carries an explicit slot, so the GET's
  // "position IS NULL" rows sort after them — new items still land last until moved.
  if (Array.isArray(body?.reorder)) {
    const ids = body.reorder.map((x) => String(x)).slice(0, 500)
    if (ids.length)
      await ctx.env.DB.batch(
        ids.map((id, i) =>
          ctx.env.DB.prepare('UPDATE list_items SET position = ? WHERE id = ? AND household_id = ?').bind(
            i,
            id,
            actor.householdId,
          ),
        ),
      )
    return ok({ ok: true })
  }

  // Rename / merge a grocery-history entry to a generic name (Réglages ▸
  // Magasinage). Re-keys every purchase_log row from the old item_key to the new
  // normalized key, so a specific flyer product name folds back into the recurring
  // item ("Oeuf blanc sélection" → "Oeufs") and the quick-add panel suggests the
  // generic one. If the new key already exists, the rows merge into it (same key).
  if (body?.historyKey && typeof body.renameTo === 'string') {
    const text = body.renameTo.trim()
    const key = text ? normalizeItem(text) : ''
    if (!text || !key) return badRequest('Texte requis.')
    await ctx.env.DB.prepare('UPDATE purchase_log SET text = ?, item_key = ? WHERE household_id = ? AND item_key = ?')
      .bind(text, key, actor.householdId, body.historyKey)
      .run()
    return ok({ ok: true })
  }

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

  // « Pas pressé » (edit scene): this line is only worth buying if a good deal is
  // on. A presentation flag — the row still checks off, clears and logs a buy like
  // any other. Stored 1/null so an unflagged row stays NULL (the default).
  if (typeof body.non_urgent === 'boolean') {
    await ctx.env.DB.prepare('UPDATE list_items SET non_urgent = ? WHERE id = ? AND household_id = ?')
      .bind(body.non_urgent ? 1 : null, body.id, actor.householdId)
      .run()
    // Flagging it drops the row to the bottom (it's no longer an errand); un-flagging
    // lifts it back to the end of the errands. Drag it wherever you like afterwards —
    // "Mon ordre" is never overruled once set.
    await settle(ctx.env.DB, actor.householdId, body.id, body.non_urgent ? 'bottom' : 'lastErrand')
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
  const body = await readJson<{ id?: string; historyKey?: string }>(ctx.request)

  // Prune a grocery-history entry (Réglages ▸ Magasinage): drop every purchase_log
  // row under this item_key, so the quick-add panel stops suggesting it. Used to
  // clear out specific flyer product names ("Oeuf blanc sélection") logged before
  // deals were attached to the generic item. The open list is left untouched.
  if (body?.historyKey) {
    await ctx.env.DB.prepare('DELETE FROM purchase_log WHERE household_id = ? AND item_key = ?')
      .bind(actor.householdId, body.historyKey)
      .run()
    return ok({ ok: true })
  }

  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM list_items WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
