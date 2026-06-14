import type { Lang } from '../i18n'

const LOCALE: Record<Lang, string> = { fr: 'fr-CA', en: 'en-CA' }

// Unix seconds -> "15 h 30" / "3:30 PM". Intl handles the locale spacing.
export function formatTime(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', minute: '2-digit' }).format(unixSec * 1000)
}

export function formatDay(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' }).format(
    unixSec * 1000,
  )
}

export function formatWeekday(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long' }).format(unixSec * 1000)
}

// Pass `utc: true` when the timestamp is a UTC day-start (the month grid + /api/month
// bucket on UTC midnight — see monthgrid.ts). Without it, a Québec evening renders the
// UTC-midnight value in LOCAL time, ~a day earlier — so "June 1 00:00 UTC" printed
// "Mai" and Sunday cells fell under the "SAM" header. The Kitchen day grid passes
// LOCAL-midnight values, so it keeps the default (utc omitted).
const tz = (utc?: boolean) => (utc ? { timeZone: 'UTC' as const } : {})

// "juin 2026" / "June 2026" — the month-view header. Intl lowercases the French
// month; the caller capitalizes.
export function formatMonthYear(unixSec: number, lang: Lang, utc?: boolean): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', year: 'numeric', ...tz(utc) }).format(unixSec * 1000)
}

// "vendredi 13 juin" / "Friday, June 13" — the month-view day-detail header.
export function formatDayLong(unixSec: number, lang: Lang, utc?: boolean): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long', ...tz(utc) }).format(
    unixSec * 1000,
  )
}

// Short weekday ("ven" / "Fri") for the meal-plan date badge. Trim the locale's
// trailing dot so it sits clean above the day number.
export function weekdayShort(unixSec: number, lang: Lang, utc?: boolean): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', ...tz(utc) }).format(unixSec * 1000).replace('.', '')
}

// Day-of-month number ("12") — the date badge's big anchor.
export function dayNum(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric' }).format(unixSec * 1000)
}

export function formatClock(lang: Lang, nowMs: number): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }).format(nowMs)
}
