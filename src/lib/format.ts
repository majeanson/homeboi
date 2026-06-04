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

export function formatClock(lang: Lang, nowMs: number): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }).format(nowMs)
}
