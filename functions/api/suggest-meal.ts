import type { Env } from '../_lib/env'
import { ok, serviceUnavailable } from '../_lib/json'
import { requireActor } from '../_lib/household'
import { suggestMeal, resolveLang } from '../_lib/ai'
import { dayStart } from '../_lib/ids'

// "Qu'est-ce qu'on mange?" — one on-demand AI call, never on a loop. Reads
// what's low + recent suppers, asks for a single suggestion. Degrades to 503
// when AI is unset; the UI hides the button.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  if (!ctx.env.AI) return serviceUnavailable('Suggestion IA indisponible ici.')

  const today = dayStart(new Date(Date.now()))
  const [low, recent] = await Promise.all([
    ctx.env.DB.prepare('SELECT item FROM pantry_low WHERE household_id = ? ORDER BY marked_at DESC LIMIT 10')
      .bind(actor.householdId)
      .all<{ item: string }>(),
    ctx.env.DB.prepare(
      'SELECT title FROM meals WHERE household_id = ? AND date < ? ORDER BY date DESC LIMIT 7',
    )
      .bind(actor.householdId, today + 86400)
      .all<{ title: string }>(),
  ])

  const suggestion = await suggestMeal(
    ctx.env,
    low.results.map((r) => r.item),
    recent.results.map((r) => r.title),
    resolveLang(ctx.env, ctx.request),
  )
  if (!suggestion) return serviceUnavailable('Pas de suggestion pour le moment.')
  return ok({ suggestion })
}
