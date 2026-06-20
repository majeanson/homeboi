import { ok, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { weeklyRecap, resolveLang } from '../_lib/ai'
import { dayStart, nowSec } from '../_lib/ids'

// On-demand weekly recap. Reads the last 7 days of events / suppers / chores
// done and asks for a gentle 2-sentence reflection (NFR-CALM: no stats). One
// call, never looped/scheduled here (NFR-COST). `requiresAi` 503s when AI is off
// (binding unset OR household switched it off) so the UI hides the recap section.
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const now = nowSec()
  const since = dayStart(new Date(Date.now())) - 86400 * 7

  const [events, meals, chores] = await Promise.all([
    // The week that HAPPENED — events already past, not upcoming ones.
    ctx.env.DB.prepare(
      'SELECT title FROM events WHERE household_id = ? AND start_at >= ? AND start_at <= ? ORDER BY start_at LIMIT 20',
    )
      .bind(hh, since, now)
      .all<{ title: string }>(),
    ctx.env.DB.prepare('SELECT title FROM meals WHERE household_id = ? AND date >= ? ORDER BY date LIMIT 20')
      .bind(hh, since)
      .all<{ title: string }>(),
    ctx.env.DB.prepare('SELECT title FROM tasks WHERE household_id = ? AND last_done_at >= ? LIMIT 20')
      .bind(hh, since)
      .all<{ title: string }>(),
  ])

  const report = { error: null as string | null }
  const recap = await weeklyRecap(
    ctx.env,
    {
      events: events.results.map((r) => r.title),
      meals: meals.results.map((r) => r.title),
      chores: chores.results.map((r) => r.title),
    },
    resolveLang(ctx.env, ctx.request),
    report,
  )
  return withAiError(ok({ recap }), report)
}, undefined, { requiresAi: true })
