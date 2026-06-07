import { ok, serviceUnavailable, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { suggestMeals, resolveLang } from '../_lib/ai'
import { dayStart } from '../_lib/ids'

// "Qu'est-ce qu'on mange?" — one on-demand AI call returns a BATCH of 10 ideas.
// The client shows them one per click and only asks again once exhausted, so 10
// suggestions cost a single inference (NFR-COST). Degrades to 503 when AI unset.
export const onRequestPost = authed(async (ctx, actor) => {
  if (!ctx.env.AI) return serviceUnavailable('Suggestion IA indisponible ici.')

  // The batch the client just showed — so re-asking yields fresh dishes, not the
  // same ten. Optional (older clients send no body).
  const body = await readJson<{ avoid?: string[] }>(ctx.request).catch(() => null)
  const avoid = Array.isArray(body?.avoid)
    ? body!.avoid.filter((x): x is string => typeof x === 'string').slice(0, 20)
    : []

  const today = dayStart(new Date(Date.now()))
  const [low, recent, favs] = await Promise.all([
    ctx.env.DB.prepare('SELECT item FROM pantry_low WHERE household_id = ? ORDER BY marked_at DESC LIMIT 10')
      .bind(actor.householdId)
      .all<{ item: string }>(),
    ctx.env.DB.prepare(
      'SELECT title FROM meals WHERE household_id = ? AND date < ? ORDER BY date DESC LIMIT 7',
    )
      .bind(actor.householdId, today + 86400)
      .all<{ title: string }>(),
    // The family's own recipe book — so "what's for supper?" can resurface dishes
    // they've actually saved, not only AI-invented ones.
    ctx.env.DB.prepare('SELECT title FROM recipes WHERE household_id = ? ORDER BY updated_at DESC LIMIT 12')
      .bind(actor.householdId)
      .all<{ title: string }>(),
  ])

  const suggestions = await suggestMeals(
    ctx.env,
    low.results.map((r) => r.item),
    recent.results.map((r) => r.title),
    resolveLang(ctx.env, ctx.request),
    favs.results.map((r) => r.title),
    avoid,
  )
  if (!suggestions.length) return serviceUnavailable('Pas de suggestion pour le moment.')
  return ok({ suggestions })
})
