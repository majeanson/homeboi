import { badRequest, ok, readJson, withAiError } from '../_lib/json'
import { authed } from '../_lib/route'
import { answerQuestion, resolveLang, type AiReport, type Lang } from '../_lib/ai'
import { aiUsable } from '../_lib/aiPref'
import { localDayStart } from '../_lib/ids'

// #12 — natural-language Q&A over the household's OWN data. The search box can ask
// "qu'est-ce qu'on mange vendredi ?" / "what did I add this week?"; we gather a
// compact, DATED snapshot (suppers, events, the list, chores, notes) and let
// answerQuestion phrase a calm reply tagged with the domain it reasoned over (the
// `kind`, which the UI turns into a category icon). One inference per ask — never
// on a render loop. Read-only: this never writes (capture stays the write spine).
//
// Dates are formatted in the household timezone so the model can resolve "Friday",
// "tomorrow", etc. — it mirrors the client's HOUSEHOLD_TZ (src/lib/localDay.ts).
const HOUSEHOLD_TZ = 'America/Toronto'
const DAY = 86400

// Meal slot → a short localized label for the AI context.
const SLOT: Record<Lang, Record<string, string>> = {
  fr: { breakfast: 'déjeuner', lunch: 'dîner', supper: 'souper', snack: 'collation' },
  en: { breakfast: 'breakfast', lunch: 'lunch', supper: 'supper', snack: 'snack' },
}

function fmtDay(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: HOUSEHOLD_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(unixSec * 1000))
}
function fmtDateTime(unixSec: number, allDay: number, lang: Lang): string {
  const day = fmtDay(unixSec, lang)
  if (allDay) return day
  const time = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: HOUSEHOLD_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(unixSec * 1000))
  return `${day} ${time}`
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ question?: string }>(ctx.request)
  const question = (body?.question ?? '').trim()
  if (!question) return badRequest('question required')

  // AI off (binding unset OR household switched it off) → tell the client up front
  // so the search box hides "Ask", skipping the snapshot gathering below entirely.
  if (!(await aiUsable(ctx.env, actor))) return ok({ answer: null, kind: 'none', degraded: true })

  const lang = resolveLang(ctx.env, ctx.request)
  const hh = actor.householdId
  const today = localDayStart(new Date(Date.now()))

  // A bounded window per category keeps the prompt small + the inference cheap.
  // Recurring events are skipped (recur_json IS NULL) — they'd need expansion; a
  // known v1 gap (the answer can still point you to the calendar).
  const [events, meals, list, chores, notes] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT title, start_at, all_day FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 40',
    )
      .bind(hh, today - 7 * DAY, today + 30 * DAY)
      .all<{ title: string; start_at: number; all_day: number }>(),
    ctx.env.DB.prepare(
      'SELECT title, date, slot, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date LIMIT 60',
    )
      .bind(hh, today - 2 * DAY, today + 14 * DAY)
      .all<{ title: string; date: number; slot: string; is_leftover: number }>(),
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
  ])

  const slotMap = SLOT[lang]
  const lines: string[] = [(lang === 'fr' ? "Aujourd'hui : " : 'Today: ') + fmtDay(today, lang) + '.']
  if (meals.results.length) {
    lines.push('', lang === 'fr' ? 'Repas planifiés :' : 'Planned meals:')
    for (const m of meals.results) {
      const tag = m.is_leftover ? (lang === 'fr' ? ' [restant]' : ' [leftover]') : ''
      lines.push(`- ${fmtDay(m.date, lang)} (${slotMap[m.slot] ?? m.slot}) : ${m.title}${tag}`)
    }
  }
  if (events.results.length) {
    lines.push('', lang === 'fr' ? 'Événements :' : 'Events:')
    for (const e of events.results) lines.push(`- ${fmtDateTime(e.start_at, e.all_day, lang)} : ${e.title}`)
  }
  if (list.results.length) {
    lines.push('', (lang === 'fr' ? "Liste d'épicerie : " : 'Grocery list: ') + list.results.map((r) => r.text).join(', '))
  }
  if (chores.results.length) {
    lines.push('', (lang === 'fr' ? 'Corvées : ' : 'Chores: ') + chores.results.map((r) => r.title).join(', '))
  }
  if (notes.results.length) {
    lines.push('', (lang === 'fr' ? 'Notes : ' : 'Notes: ') + notes.results.map((r) => r.text).join(' · '))
  }

  const report: AiReport = { error: null }
  const result = await answerQuestion(ctx.env, question, lines.join('\n'), lang, report)
  // result null + AI present → a real failure (report.error set) → client shows the
  // "couldn't answer" + suggestions; result null + no AI → degraded path.
  return withAiError(ok({ answer: result?.answer ?? null, kind: result?.kind ?? 'none', degraded: !ctx.env.AI }), report)
})
