import type { Lang } from '../i18n'

const LOCALE: Record<Lang, string> = { fr: 'fr-CA', en: 'en-CA' }

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

export function formatWeekday(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long' }).format(unixSec * 1000)
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
