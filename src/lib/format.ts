import type { Lang } from '../i18n'
import { daysUntilLocal } from './localDay'

const LOCALE: Record<Lang, string> = { fr: 'fr-CA', en: 'en-CA' }

// Capitalize the first letter (e.g. a locale day name "lundi" → "Lundi"). Shared so
// the departure/moment/itinerary/day surfaces don't each re-declare it.
export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// Unix seconds -> "15 h 30" / "3:30 PM". Intl handles the locale spacing.
export function formatTime(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', minute: '2-digit' }).format(unixSec * 1000)
}

// Calm relative time for the "Récents" session log (#38) — "à l'instant",
// "il y a 4 s", "il y a 2 min", "il y a 1 h". Coarse on purpose: a household
// glance, never a precise audit clock. `at` and `now` are in milliseconds; `now`
// is injectable so it stays pure/testable (Date.now is fine in app code).
export function formatAgo(at: number, lang: Lang, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 10) return lang === 'fr' ? 'à l’instant' : 'just now'
  if (s < 60) return lang === 'fr' ? `il y a ${s} s` : `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return lang === 'fr' ? `il y a ${m} min` : `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return lang === 'fr' ? `il y a ${h} h` : `${h} h ago`
  const d = Math.floor(h / 24)
  return lang === 'fr' ? `il y a ${d} j` : `${d} d ago`
}

export function formatDay(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' }).format(
    unixSec * 1000,
  )
}

// A moment, not a day: "sam. 11 juill., 15 h 30". For anything stamped at an
// instant (a mot, a note) shown in its detail view — a bare day can't tell two
// messages of the same afternoon apart. Row/list surfaces keep formatDay.
export function formatDayTime(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(unixSec * 1000)
}

// Like formatDay, but appends the year once the date is far out (more than ~11
// months from `now`) so a long-horizon home project reads unambiguously across
// the year boundary ("sam 4 mars 2028"). Near dates stay terse. `now` is
// injectable (ms) so it stays pure/testable.
export function formatDayMaybeYear(unixSec: number, lang: Lang, now: number = Date.now()): string {
  const ELEVEN_MONTHS_SEC = 11 * 30 * 24 * 60 * 60
  const far = unixSec - now / 1000 > ELEVEN_MONTHS_SEC
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(far ? { year: 'numeric' } : {}),
  }).format(unixSec * 1000)
}

export function formatWeekday(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long' }).format(unixSec * 1000)
}

// Like formatWeekday, but anchors the two nearest days to "today"/"tomorrow" so a
// day picker reads "Aujourd'hui · Demain · mercredi · jeudi…" instead of a wall of
// bare weekday names where the user has to work out which one is now. The labels
// are passed in (the caller owns the locale copy — t.board.today/tomorrow); `now`
// is injectable so it stays pure/testable.
export function formatRelativeWeekday(
  unixSec: number,
  lang: Lang,
  todayLabel: string,
  tomorrowLabel: string,
  now: number = Date.now(),
): string {
  const d = daysUntilLocal(unixSec, now)
  if (d === 0) return todayLabel
  if (d === 1) return tomorrowLabel
  // Capitalize the bare weekday so it sits uniformly beside the capitalized
  // "Aujourd'hui"/"Demain" chips (Intl lowercases the French weekday).
  const wd = formatWeekday(unixSec, lang)
  return wd.charAt(0).toUpperCase() + wd.slice(1)
}

// These render LOCAL-midnight day-starts (the Kitchen day grid + the month view,
// both now keyed on local midnight — lib/localDay / lib/monthgrid). Local Intl is
// correct: the values already mark the household's wall day, so no UTC override.

// "juin 2026" / "June 2026" — the month-view header. Intl lowercases the French
// month; the caller capitalizes.
export function formatMonthYear(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', year: 'numeric' }).format(unixSec * 1000)
}

// "vendredi 13 juin" / "Friday, June 13" — the month-view day-detail header.
export function formatDayLong(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' }).format(
    unixSec * 1000,
  )
}

// Short weekday ("ven" / "Fri") for the meal-plan date badge. Trim the locale's
// trailing dot so it sits clean above the day number.
export function weekdayShort(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short' }).format(unixSec * 1000).replace('.', '')
}

// Day-of-month number ("12") — the date badge's big anchor.
export function dayNum(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric' }).format(unixSec * 1000)
}
