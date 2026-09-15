import type { Env } from './env'
import { newId, nowSec, localDayStart, addLocalDays } from './ids'
import { parseIcs } from './ics'

// Fetching and refreshing « Les calendriers » (migration 0129). Kept out of the
// handler so the cron and the "refresh now" button run the SAME code — a refresh that
// behaves differently from the nightly one is a bug that only appears at 2 AM.

/** How far around today a feed is expanded. Past days are kept because a calendar is
 *  also a record of what happened (« c'était quand, la journée pédagogique ? »), and
 *  four months ahead covers a school term without expanding a decade of a daily rule. */
const WINDOW_BACK_DAYS = 30
const WINDOW_AHEAD_DAYS = 120

/** A feed bigger than this is not a household calendar; refusing it protects the
 *  Worker's memory rather than trusting a stranger's server to be reasonable. */
const MAX_BYTES = 2_000_000
/** A slow feed must not eat the whole cron. */
const FETCH_TIMEOUT_MS = 10_000

export interface FeedRow {
  id: string
  household_id: string
  url: string
  etag: string | null
  last_modified: string | null
}

export type FeedError = 'http' | 'too-big' | 'not-ics' | 'network'

export interface RefreshOutcome {
  /** false when the server said 304 — nothing changed, nothing rewritten. */
  changed: boolean
  error: FeedError | null
  count: number
  partial: number
}

/**
 * Fetch one feed and, if it changed, REPLACE its expanded window wholesale.
 *
 * Wholesale, never merged: the feed is the truth, and a row that survived a refresh it
 * was not in is an event the school already cancelled. Diffing would preserve exactly
 * the rows we most need to lose.
 */
export async function refreshFeed(env: Env, feed: FeedRow, now: number = nowSec()): Promise<RefreshOutcome> {
  const today = localDayStart(new Date(now * 1000))
  const from = addLocalDays(today, -WINDOW_BACK_DAYS)
  const to = addLocalDays(today, WINDOW_AHEAD_DAYS)

  let res: Response
  try {
    const headers: Record<string, string> = { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' }
    // A conditional GET: an unchanged school calendar costs one 304 and no parsing,
    // which is what makes running every household's feeds on one cron affordable.
    if (feed.etag) headers['if-none-match'] = feed.etag
    if (feed.last_modified) headers['if-modified-since'] = feed.last_modified
    res = await fetch(feed.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' })
  } catch {
    await markError(env, feed.id, 'network', now)
    return { changed: false, error: 'network', count: 0, partial: 0 }
  }

  if (res.status === 304) {
    await env.DB.prepare('UPDATE calendar_feeds SET last_fetch_at = ?, last_error = NULL, updated_at = ? WHERE id = ?')
      .bind(now, now, feed.id)
      .run()
    return { changed: false, error: null, count: 0, partial: 0 }
  }
  if (!res.ok) {
    await markError(env, feed.id, 'http', now)
    return { changed: false, error: 'http', count: 0, partial: 0 }
  }

  // Length first where the server declares one, then again after reading: a missing
  // content-length is not a promise that the body is small.
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) {
    await markError(env, feed.id, 'too-big', now)
    return { changed: false, error: 'too-big', count: 0, partial: 0 }
  }
  const text = await res.text()
  if (text.length > MAX_BYTES) {
    await markError(env, feed.id, 'too-big', now)
    return { changed: false, error: 'too-big', count: 0, partial: 0 }
  }
  // The common real-world failure is not a 404 — it is a 200 carrying a login page.
  // Refusing here is what keeps a household from seeing an empty calendar and
  // concluding the feature is broken.
  if (!text.includes('BEGIN:VCALENDAR')) {
    await markError(env, feed.id, 'not-ics', now)
    return { changed: false, error: 'not-ics', count: 0, partial: 0 }
  }

  const { occurrences, partial } = parseIcs(text, from, to)

  // Replace the window in one batch: the delete and the inserts must not be separable,
  // or a failure between them leaves the household with an empty calendar.
  const stmts = [env.DB.prepare('DELETE FROM feed_events WHERE feed_id = ?').bind(feed.id)]
  for (const o of occurrences) {
    stmts.push(
      env.DB
        .prepare(
          'INSERT INTO feed_events (id, feed_id, household_id, uid, title, location, start_at, end_at, all_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(newId(), feed.id, feed.household_id, o.uid, o.title, o.location, o.startAt, o.endAt, o.allDay ? 1 : 0, now),
    )
  }
  stmts.push(
    env.DB
      .prepare(
        'UPDATE calendar_feeds SET etag = ?, last_modified = ?, last_fetch_at = ?, last_error = NULL, partial_count = ?, updated_at = ? WHERE id = ?',
      )
      .bind(res.headers.get('etag'), res.headers.get('last-modified'), now, partial, now, feed.id),
  )
  await env.DB.batch(stmts)
  return { changed: true, error: null, count: occurrences.length, partial }
}

async function markError(env: Env, feedId: string, error: FeedError, now: number): Promise<void> {
  // The rows already fetched STAY. A feed whose server is down for a night should show
  // last night's calendar, not an empty one — the same "keep the last good frame"
  // posture the board takes on a failed poll.
  await env.DB.prepare('UPDATE calendar_feeds SET last_fetch_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
    .bind(now, error, now, feedId)
    .run()
}

/**
 * Refresh every enabled feed, household-wide. Called by the nightly cron.
 *
 * Bounded on purpose (`limit`): this shares one scheduled invocation with the backup
 * sweep, and a Worker has a CPU budget. Feeds are taken oldest-fetch-first, so a
 * deployment with more feeds than one night's budget still refreshes all of them —
 * just across several nights, starting with the stalest.
 */
export async function refreshAllFeeds(env: Env, limit = 50, now: number = nowSec()): Promise<{ ok: number; failed: number }> {
  const rows = await env.DB.prepare(
    'SELECT id, household_id, url, etag, last_modified FROM calendar_feeds WHERE deleted_at IS NULL AND enabled = 1 ORDER BY COALESCE(last_fetch_at, 0) LIMIT ?',
  )
    .bind(limit)
    .all<FeedRow>()
  let ok = 0
  let failed = 0
  for (const feed of rows.results) {
    try {
      const out = await refreshFeed(env, feed, now)
      if (out.error) failed++
      else ok++
    } catch {
      // One bad feed must never stop the others — this is a shared nightly job.
      failed++
    }
  }
  return { ok, failed }
}
