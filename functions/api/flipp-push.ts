import { ok, badRequest } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { pushToFlipp, type FlippLinkRow } from '../_lib/flippAccount'

// POST /api/flipp-push — the linked household's till (« Envoyer à Flipp ») sends its
// clippings + typed lines here, and the server writes them into the Flipp account
// list (deals WITH their photo, no per-item tap). Requires « Lier Flipp » first
// (403-ish → a plain "not linked" the client turns back into the bookmark path).
// Operator-only, like the link itself. The push result (and any Flipp-side error)
// is stamped on the row so the Réglages card can show when it last worked.

interface Row extends FlippLinkRow {
  list_id: string | null
}

export const onRequestPost = authed(async (ctx, actor) => {
  const row = await ctx.env.DB.prepare('SELECT * FROM flipp_links WHERE household_id = ?')
    .bind(actor.householdId)
    .first<Row>()
  if (!row) return ok({ linked: false })

  const body = (await ctx.request.json().catch(() => null)) as {
    clippings?: unknown
    items?: unknown
  } | null
  const clippings = Array.isArray(body?.clippings) ? (body!.clippings as never[]) : []
  const items = Array.isArray(body?.items) ? (body!.items as unknown[]).filter((t): t is string => typeof t === 'string') : []
  if (!clippings.length && !items.length) return badRequest('Rien à envoyer.')

  const result = await pushToFlipp(row, ctx.env.SESSION_SECRET, clippings, items)
  const now = nowSec()
  if (result.ok) {
    // Remember the resolved list id (saves a round-trip next time) and clear the error.
    await ctx.env.DB.prepare('UPDATE flipp_links SET list_id = ?, last_push_at = ?, last_error = NULL, updated_at = ? WHERE household_id = ?')
      .bind(result.listId ?? row.list_id, now, now, actor.householdId)
      .run()
  } else {
    await ctx.env.DB.prepare('UPDATE flipp_links SET last_error = ?, updated_at = ? WHERE household_id = ?')
      .bind(result.error ?? 'unknown', now, actor.householdId)
      .run()
  }
  return ok({ linked: true, ...result })
}, 'operator')
