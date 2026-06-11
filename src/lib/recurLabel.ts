import type { FR } from '../i18n'
import type { RecurValue } from '../components/RecurPicker'

// Parse a stored recur_json into the form's RecurValue (or null). Mirrors the
// EventForm helper so chores and events read a rule the same way.
export function recurOf(json?: string | null): RecurValue | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Partial<RecurValue>
    if (v.freq === 'daily' || v.freq === 'weekly' || v.freq === 'monthly') {
      return { freq: v.freq, interval: v.interval ?? 1, weekdays: v.weekdays ?? [] }
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
  if (r.freq === 'weekly' && r.weekdays.length) {
    const days = r.weekdays.map((d) => t.recur.weekdayShort[d]).join(', ')
    return `${t.recur.weekly} (${days})`
  }
  if (r.interval > 1) return `${t.recur.every} ${r.interval} ${t.recur.unit[r.freq]}`
  return r.freq === 'daily' ? t.recur.daily : r.freq === 'weekly' ? t.recur.weekly : t.recur.monthly
}
