import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { normalizeItem } from '../_lib/normalize'
import { profileMemberId } from '../_lib/profile'

// Shared list: read open + recently-checked, add, toggle, delete. Both operator
// and kiosk can write — ticking a grocery item is exactly what the wall tablet
// is for. No score for clearing items (NFR-CALM): done is just done.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, text, source, added_by, checked_at FROM list_items WHERE household_id = ? ORDER BY checked_at IS NOT NULL, created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ items: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  // `deal` optionally stages a flyer deal onto the new line (the cashier set lives
  // on the list now) — stored as JSON; absent for an ordinary grocery item.
  const body = await readJson<{ text?: string; deal?: unknown }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Texte requis.')
  const id = newId()
  const dealJson = body?.deal ? JSON.stringify(body.deal) : null
  await ctx.env.DB.prepare(
    'INSERT INTO list_items (id, household_id, text, source, added_by, deal_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text, 'manual', profileMemberId(ctx.request), dealJson, nowSec())
    .run()
  return ok({ id, text })
})

// PATCH toggles checked; DELETE removes. Scoped to the household so a kiosk
// can't touch another household's rows even with a forged id.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; checked?: boolean; deal?: unknown }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  // Stage / unstage a flyer deal on this line — `deal` present (object → stage,
  // null → unstage) updates deal_json. This is how the cashier set is built now.
  if ('deal' in body) {
    const dealJson = body.deal ? JSON.stringify(body.deal) : null
    await ctx.env.DB.prepare('UPDATE list_items SET deal_json = ? WHERE id = ? AND household_id = ?')
      .bind(dealJson, body.id, actor.householdId)
      .run()
  }

  // Checking an item off = buying it. Record it in purchase_log so the ghost list
  // can learn what's bought and how often (its renewal cadence). We need the item's
  // text for the normalized key, so fetch it, then write the toggle and the log row
  // in one transaction. Unchecking just clears the timestamp.
  if (typeof body.checked === 'boolean') {
    const ts = body.checked ? nowSec() : null
    const row = ts
      ? await ctx.env.DB.prepare('SELECT text FROM list_items WHERE id = ? AND household_id = ?')
          .bind(body.id, actor.householdId)
          .first<{ text: string }>()
      : null
    const writes = [
      ctx.env.DB.prepare('UPDATE list_items SET checked_at = ? WHERE id = ? AND household_id = ?').bind(
        ts,
        body.id,
        actor.householdId,
      ),
    ]
    const key = row ? normalizeItem(row.text) : ''
    if (ts && row && key) {
      writes.push(
        ctx.env.DB.prepare(
          'INSERT INTO purchase_log (id, household_id, item_key, text, purchased_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(newId(), actor.householdId, key, row.text, ts),
      )
    }
    await ctx.env.DB.batch(writes)
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
