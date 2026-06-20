import { ok, serviceUnavailable, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { suggestMeals, resolveLang } from '../_lib/ai'
import { localDayStart } from '../_lib/ids'

// "Qu'est-ce qu'on mange?" — one on-demand AI call returns a BATCH of 10 ideas.
// The client shows them one per click and only asks again once exhausted, so 10
// suggestions cost a single inference (NFR-COST). `requiresAi` 503s when AI is off
// (binding unset OR household switched it off); the UI then hides the button.
export const onRequestPost = authed(async (ctx, actor) => {
  // The batch the client just showed — so re-asking yields fresh dishes, not the
  // same ten. Optional (older clients send no body).
  const body = await readJson<{ avoid?: string[] }>(ctx.request).catch(() => null)
  const avoid = Array.isArray(body?.avoid)
    ? body!.avoid.filter((x): x is string => typeof x === 'string').slice(0, 20)
    : []

  const today = localDayStart(new Date(Date.now()))
  // "Haven't had in a while" (PRD): favourites the family hasn't cooked recently.
  // Join the recipe book to the LAST time each linked recipe was served
  // (MAX(meals.date) grouped by recipe_id, this household), and keep the ones whose
  // last serving is older than the neglected cutoff (or never served). Bringing a
  // few of these back is a GENTLE preference passed to the suggester, never shame.
  const NEGLECT_CUTOFF = today - 14 * 86400 // not served in > 14 days
  const [low, recent, favs, neglected] = await Promise.all([
    ctx.env.DB.prepare('SELECT item FROM pantry_low WHERE household_id = ? ORDER BY marked_at DESC LIMIT 10')
      .bind(actor.householdId)
      .all<{ item: string }>(),
    ctx.env.DB.prepare(
      'SELECT title FROM meals WHERE household_id = ? AND date < ? ORDER BY date DESC LIMIT 7',
    )
      .bind(actor.householdId, today + 86400)
      .all<{ title: string }>(),
    // The family's own recipe book — so "what's for supper?" can resurface dishes
    // they've actually saved, not only AI-invented ones. LOVED recipes (#21 hearts)
    // lead the list: a gentle preference passed to the suggester, never a shown
    // count/rank (the love total stays server-side).
    ctx.env.DB.prepare(
      `SELECT r.title AS title
         FROM recipes r
         LEFT JOIN recipe_loves rl ON rl.recipe_id = r.id AND rl.household_id = r.household_id
        WHERE r.household_id = ?
        GROUP BY r.id
        ORDER BY COUNT(rl.member_id) DESC, r.updated_at DESC
        LIMIT 12`,
    )
      .bind(actor.householdId)
      .all<{ title: string }>(),
    // Recipes whose most recent serving (via meals.recipe_id, migration 0024) is
    // before the cutoff, or that were never linked to a meal at all — "haven't had
    // in a while". Most-neglected first; capped so the prompt stays short.
    ctx.env.DB.prepare(
      `SELECT r.title AS title, MAX(m.date) AS last
         FROM recipes r
         LEFT JOIN meals m
           ON m.recipe_id = r.id AND m.household_id = r.household_id
          AND m.date <= ?
        WHERE r.household_id = ?
        GROUP BY r.id
       HAVING last IS NULL OR last < ?
        ORDER BY (last IS NULL) DESC, last ASC
        LIMIT 8`,
    )
      .bind(today, actor.householdId, NEGLECT_CUTOFF)
      .all<{ title: string; last: number | null }>(),
  ])

  const report = { error: null as string | null }
  const suggestions = await suggestMeals(
    ctx.env,
    low.results.map((r) => r.item),
    recent.results.map((r) => r.title),
    resolveLang(ctx.env, ctx.request),
    favs.results.map((r) => r.title),
    avoid,
    report,
    neglected.results.map((r) => r.title),
  )
  // The header rides on the 503 too: an empty batch from a real AI failure now
  // carries the reason, while a genuinely empty result stays a quiet 503.
  if (!suggestions.length) return withAiError(serviceUnavailable('Pas de suggestion pour le moment.'), report)
  return ok({ suggestions })
}, undefined, { requiresAi: true })
