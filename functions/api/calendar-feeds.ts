import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { refreshFeed, type FeedRow } from '../_lib/calendarFeeds'

// « Les calendriers » — subscribe to a read-only ICS feed (migration 0129).
//
//   GET    /api/calendar-feeds            -> { feeds: [...] }
//   POST   /api/calendar-feeds  { url, label, colour?, memberId? }   -> adds + fetches once
//   PATCH  /api/calendar-feeds  { id, label?, colour?, memberId?, enabled?, refresh? }
//   DELETE /api/calendar-feeds  { id }    -> soft-delete + drop its expanded rows
//
// Operator-only. A subscription is a standing outbound request this deployment makes
// on the household's behalf, to a URL somebody typed — that is an operator decision,
// not something a wall tablet should be able to add.

/** https only, and no credentials in the URL. A feed address is stored, fetched
 *  server-side on a schedule and shown back in Réglages; `http://` would put the
 *  household's private calendar token on the wire in clear, and `user:pass@` would
 *  put it in a settings field anyone walking past the tablet can read. */
function badUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 'Adresse invalide.'
  }
  // webcal:// is how most calendars publish their "subscribe" link; it IS https.
  if (u.protocol === 'webcal:') return null
  if (u.protocol !== 'https:') return 'L’adresse doit commencer par https:// (ou webcal://).'
  if (u.username || u.password) return 'Enlève le nom d’usager et le mot de passe de l’adresse.'
  return null
}

const normalizeUrl = (raw: string) => (raw.trim().startsWith('webcal://') ? 'https://' + raw.trim().slice('webcal://'.length) : raw.trim())

export const onRequestGet = authed(async (ctx, actor) => {
  // Bounded like every other list read (listCap's ratchet): a household subscribes to
  // a handful of calendars, and a limit nobody reaches keeps that number honest.
  const rows = await ctx.env.DB.prepare(
    'SELECT id, url, label, colour, member_id, enabled, last_fetch_at, last_error, partial_count FROM calendar_feeds WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 50',
  )
    .bind(actor.householdId)
    .all<{
      id: string
      url: string
      label: string
      colour: string | null
      member_id: string | null
      enabled: number
      last_fetch_at: number | null
      last_error: string | null
      partial_count: number
    }>()
  // How many expanded rows each feed currently holds — the only honest answer to "is
  // this working?", and cheaper to ask here once than to make the UI guess from dates.
  // LIMIT 50 on a GROUP BY that returns one row per FEED, and feeds are already
  // capped at 50 above — so this can never truncate anything real. It is here because
  // listCap.test.ts is a whole-repo ratchet on uncapped `.all()` reads: the count only
  // means something if every author bounds their own, including the ones that are
  // obviously bounded already.
  const counts = await ctx.env.DB.prepare(
    'SELECT feed_id, COUNT(*) AS n FROM feed_events WHERE household_id = ? GROUP BY feed_id LIMIT 50',
  )
    .bind(actor.householdId)
    .all<{ feed_id: string; n: number }>()
  const byFeed = new Map(counts.results.map((c) => [c.feed_id, c.n]))
  return ok({
    feeds: rows.results.map((r) => ({
      id: r.id,
      url: r.url,
      label: r.label,
      colour: r.colour,
      memberId: r.member_id,
      enabled: r.enabled === 1,
      lastFetchAt: r.last_fetch_at,
      lastError: r.last_error,
      partialCount: r.partial_count,
      eventCount: byFeed.get(r.id) ?? 0,
    })),
  })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ url?: string; label?: string; colour?: string; memberId?: string | null }>(ctx.request)
  const url = normalizeUrl(body?.url ?? '')
  if (!url) return badRequest('Adresse requise.')
  const bad = badUrl(body?.url?.trim() ?? '')
  if (bad) return badRequest(bad)
  const label = (body?.label ?? '').trim().slice(0, 60)
  if (!label) return badRequest('Donne un nom à ce calendrier.')

  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO calendar_feeds (id, household_id, url, label, colour, member_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, url, label, body?.colour ?? null, body?.memberId ?? null, ts, ts)
    .run()

  // Fetch ONCE, now, and report what happened. Waiting for the nightly cron would mean
  // adding a calendar and being shown an empty one with no way to tell a typo from a
  // slow schedule — the difference between "it does not work" and "it is not tonight".
  const feed: FeedRow = { id, household_id: actor.householdId, url, etag: null, last_modified: null }
  const out = await refreshFeed(ctx.env, feed, ts)
  return ok({ id, ...out })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    label?: string
    colour?: string | null
    memberId?: string | null
    enabled?: boolean
    refresh?: boolean
  }>(ctx.request)
  const id = (body?.id ?? '').trim()
  if (!id) return badRequest('Calendrier manquant.')
  const row = await ctx.env.DB.prepare(
    'SELECT id, household_id, url, etag, last_modified FROM calendar_feeds WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<FeedRow>()
  if (!row) return notFound('Calendrier introuvable.')

  const ts = nowSec()
  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body?.label === 'string') {
    sets.push('label = ?')
    binds.push(body.label.trim().slice(0, 60))
  }
  if (body && 'colour' in body) {
    sets.push('colour = ?')
    binds.push(body.colour ?? null)
  }
  if (body && 'memberId' in body) {
    sets.push('member_id = ?')
    binds.push(body.memberId ?? null)
  }
  if (typeof body?.enabled === 'boolean') {
    sets.push('enabled = ?')
    binds.push(body.enabled ? 1 : 0)
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    binds.push(ts, id)
    await ctx.env.DB.prepare(`UPDATE calendar_feeds SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  }

  // « Rafraîchir maintenant ». Clearing the validators first makes it a real refetch
  // rather than a 304 — which is the whole point of a manual refresh: the household
  // taps it because they believe the feed changed and we are showing stale rows.
  if (body?.refresh) {
    const out = await refreshFeed(ctx.env, { ...row, etag: null, last_modified: null }, ts)
    return ok(out)
  }
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = (body?.id ?? '').trim()
  if (!id) return badRequest('Calendrier manquant.')
  const ts = nowSec()
  // Soft-delete the subscription, HARD-delete its expanded rows. The row is kept so an
  // undo could restore it; the events are not, because leaving them would show a
  // calendar the household just unsubscribed from — and they cost nothing to refetch.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE calendar_feeds SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ?').bind(ts, ts, id, actor.householdId),
    ctx.env.DB.prepare('DELETE FROM feed_events WHERE feed_id = ? AND household_id = ?').bind(id, actor.householdId),
  ])
  return ok({ ok: true })
}, 'operator')
