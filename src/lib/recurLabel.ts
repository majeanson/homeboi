import type { FR } from '../i18n'
import type { RecurValue } from '../components/RecurPicker'

// Parse a stored recur_json into the form's RecurValue (or null). The single
// reader shared by the event form, the chore rows, and the chore label — so a
// rule is parsed (and defended) one way everywhere. Weekdays are filtered to
// 0–6 so a corrupt stored value can't break the RecurPicker.
export function recurOf(json?: string | null): RecurValue | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Partial<RecurValue>
    if (v.freq === 'daily' || v.freq === 'weekly' || v.freq === 'monthly') {
      const weekdays = Array.isArray(v.weekdays)
        ? v.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : []
      return { freq: v.freq, interval: v.interval ?? 1, weekdays }
    }
  } catch {
    /* malformed → no rule */
  }
  return null
}

// A short human label for a recurrence rule, for the chore list ("Tous les
// jeudis", "Chaque jour"). Empty string for no rule. Uses the existing recur
// copy so it stays bilingual.
export function recurLabel(json: string | null | undefined, t: typeof FR): string {
  const r = recurOf(json)
  if (!r) return ''
  // Base cadence: "Chaque semaine" at interval 1, "tous les N semaine(s)" beyond —
  // so the count ("how many weeks") is always spelled out, not just implied.
  const base =
    r.interval > 1
      ? `${t.recur.every} ${r.interval} ${t.recur.unit[r.freq]}`
      : r.freq === 'daily'
        ? t.recur.daily
        : r.freq === 'weekly'
          ? t.recur.weekly
          : t.recur.monthly
  // Weekly rules append the picked days (L Ma Me J V S D), disambiguated in copy.
  if (r.freq === 'weekly' && r.weekdays.length) {
    const days = r.weekdays.map((d) => t.recur.weekdayShort[d]).join(' ')
    return `${base} (${days})`
  }
  return base
}

// The recurrence anchor is stored as unix-seconds at UTC-midnight of the chosen
// day (see functions/_lib/recur, which does UTC day math). These two helpers
// convert between that and the `yyyy-mm-dd` an <input type="date"> speaks, both
// in UTC so the day the operator picks is the day the board expands from.
const pad = (n: number) => String(n).padStart(2, '0')

export function dateToAnchorSec(date: string): number | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.floor(Date.UTC(y, m - 1, d) / 1000)
}

export function anchorSecToDate(sec?: number | null): string {
  if (!sec) return ''
  const d = new Date(sec * 1000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Today as `yyyy-mm-dd` in UTC — the default anchor when a recurrence is first
// picked, matching the board's `today = dayStart(now)` (also UTC).
export function todayAnchorDate(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
