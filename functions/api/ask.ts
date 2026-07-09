import { badRequest, ok, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { answerQuestion, resolveLang, type AiReport } from '../_lib/ai'
import { aiUsable } from '../_lib/aiPref'
import { localDayStart } from '../_lib/ids'
import { fetchBirthdayPeople } from '../_lib/birthdays'
import { fetchCarnetLifeItems } from '../_lib/carnetLife'
import {
  buildAskPromptLines,
  expandAskEvents,
  birthdaysForPrompt,
  carnetDuesForPrompt,
  type AskEventRow,
  type AskRecurEventRow,
  type AskMealRow,
  type AskContactRow,
  type AskBusinessRow,
} from '../_lib/askContext'

// #12 / E-22 — natural-language Q&A over the household's OWN data. The search box
// (and the board mic « Demande à la maison ») can ask "qu'est-ce qu'on mange
// vendredi ?" / "quel est le numéro du vétérinaire ?"; we gather a compact, DATED
// snapshot (suppers, events incl. recurring, birthdays, the list, chores, notes,
// Le cercle contacts + businesses, carnet next-dues) and let answerQuestion phrase
// a calm reply tagged with the domain it reasoned over (the `kind`, which the UI
// turns into a category icon). One inference per ask — never on a render loop.
// Read-only: this never writes (capture stays the write spine).
//
// The DB reads + row shapes live here; the pure formatting/expansion/caps live in
// _lib/askContext.ts (independently unit-tested — formatting, recur expansion,
// birthdays, contacts/carnets, caps, FR/EN).
const DAY = 86400

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ question?: string }>(ctx.request)
  const question = (body?.question ?? '').trim()
  if (!question) return badRequest('question required')

  // AI off (binding unset OR household switched it off) → tell the client up front
  // so the caller (search box / AskSheet) hides "Ask", skipping the snapshot
  // gathering below entirely.
  if (!(await aiUsable(ctx.env, actor))) return ok({ answer: null, kind: 'none', degraded: true })

  const lang = resolveLang(ctx.env, ctx.request)
  const hh = actor.householdId
  const today = localDayStart(new Date(Date.now()))
  // Events window: a bounded horizon (last week → next month) — wide enough for
  // "what's this week" without unbounding the prompt. Birthdays get their OWN,
  // wider window below (asked well ahead of the date, unlike an appointment).
  const rangeStart = today - 7 * DAY
  const rangeEnd = today + 30 * DAY
  const birthdayRangeEnd = today + 365 * DAY

  const [meals, oneOffEvents, recurEvents, list, chores, notes, birthdayPeople, contacts, businesses, carnetItems] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT title, date, slot, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date LIMIT 60',
    )
      .bind(hh, today - 2 * DAY, today + 14 * DAY)
      .all<AskMealRow>(),
    ctx.env.DB.prepare(
      'SELECT title, start_at, all_day FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 60',
    )
      .bind(hh, rangeStart, rangeEnd)
      .all<AskEventRow>(),
    // Recurring series: one row per series, expanded in _lib/askContext (mirrors
    // board.ts/year.ts — the ONLY DB-side change vs a one-off query is dropping the
    // date filter, since a series' anchor can be arbitrarily old).
    ctx.env.DB.prepare('SELECT title, start_at, all_day, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL')
      .bind(hh)
      .all<AskRecurEventRow>(),
    ctx.env.DB.prepare('SELECT text FROM list_items WHERE household_id = ? AND checked_at IS NULL ORDER BY created_at LIMIT 60')
      .bind(hh)
      .all<{ text: string }>(),
    ctx.env.DB.prepare('SELECT title FROM tasks WHERE household_id = ? ORDER BY created_at LIMIT 30')
      .bind(hh)
      .all<{ title: string }>(),
    ctx.env.DB.prepare(
      'SELECT text FROM notes WHERE household_id = ? AND dismissed_at IS NULL AND text IS NOT NULL ORDER BY created_at DESC LIMIT 12',
    )
      .bind(hh)
      .all<{ text: string }>(),
    fetchBirthdayPeople(ctx.env.DB, hh),
    // Le cercle contacts (v1 broadening, E-22): name + how to reach them.
    ctx.env.DB.prepare(
      'SELECT first_name, last_name, nickname, phone, email FROM contacts WHERE household_id = ? ORDER BY first_name LIMIT 30',
    )
      .bind(hh)
      .all<AskContactRow>(),
    // Services & vendors (vet, plumber…) — a business is NOT a cercle person, but
    // is exactly what « le numéro du vétérinaire » needs.
    ctx.env.DB.prepare(
      'SELECT name, category, phone FROM businesses WHERE household_id = ? AND deleted_at IS NULL ORDER BY name LIMIT 30',
    )
      .bind(hh)
      .all<AskBusinessRow>(),
    fetchCarnetLifeItems(ctx.env.DB, hh),
  ])

  const lines = buildAskPromptLines(
    {
      today,
      meals: meals.results,
      events: expandAskEvents(oneOffEvents.results, recurEvents.results, rangeStart, rangeEnd),
      birthdays: birthdaysForPrompt(birthdayPeople, rangeStart, birthdayRangeEnd),
      list: list.results,
      chores: chores.results,
      notes: notes.results,
      contacts: contacts.results,
      businesses: businesses.results,
      carnetDues: carnetDuesForPrompt(carnetItems, today),
    },
    lang,
  )

  const report: AiReport = { error: null }
  const result = await answerQuestion(ctx.env, question, lines.join('\n'), lang, report)
  // result null + AI present → a real failure (report.error set) → client shows the
  // "couldn't answer" + suggestions; result null + no AI → degraded path.
  return withAiError(ok({ answer: result?.answer ?? null, kind: result?.kind ?? 'none', degraded: !ctx.env.AI }), report)
})
