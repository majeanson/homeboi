import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Cluster } from '../Layout'

// The in-app reminder times for a habit, as minutes past LOCAL midnight (the shape
// habits.reminders_json stores). Wall-clock minutes, so they survive DST — and they
// are read-time only: an open screen notices the moment has come. There is no push
// and no cron in this app (NFR-CALM-1); a phone in a pocket stays quiet.
//
// Rows are <Cluster>s, so a narrow phone wraps the ✕ under the time input instead
// of bleeding off the right edge.

const pad = (n: number) => String(n).padStart(2, '0')

/** 540 → "09:00" (what <input type="time"> speaks). */
export function minutesToHhmm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

/** "09:00" → 540, or null when the field is empty/half-typed. */
export function hhmmToMinutes(v: string): number | null {
  const [h, m] = v.split(':').map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null
  return h * 60 + m
}

const MAX = 6

export function ReminderTimesField({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const t = useT()
  const fn = t.habits

  // Sorted + deduped on every edit, so the stored array matches what the server
  // normalizes to and the "already fired today" bookkeeping stays stable.
  const commit = (next: number[]) => onChange([...new Set(next)].sort((a, b) => a - b))

  const setAt = (i: number, hhmm: string) => {
    const min = hhmmToMinutes(hhmm)
    if (min === null) return
    commit(value.map((m, j) => (j === i ? min : m)))
  }

  return (
    <div className="reminders">
      <span className="reminders__label mono">{fn.remindersLabel}</span>
      {/* The form's three time-shaped blocks used to read as rivals: this line says
          what a reminder is NOT (it is not the rhythm — it never adds a day). */}
      <p className="reminders__sub mono">{fn.remindersSub}</p>
      {value.map((min, i) => (
        <Cluster key={i} className="reminders__row">
          <input
            className="input reminders__time"
            type="time"
            value={minutesToHhmm(min)}
            aria-label={fn.reminderAt}
            onChange={(e) => setAt(i, e.target.value)}
          />
          <button
            type="button"
            className="btn btn--ghost"
            aria-label={fn.removeReminder}
            onClick={() => commit(value.filter((_, j) => j !== i))}
          >
            <Icon name="x-bold" size={16} />
          </button>
        </Cluster>
      ))}
      {value.length < MAX && (
        <button
          type="button"
          className="btn btn--ghost reminders__add"
          // A first reminder lands at 09:00; each next one an hour after the last,
          // clamped inside the day — so tapping ＋ repeatedly never collides.
          onClick={() => commit([...value, value.length ? Math.min(1439, value[value.length - 1] + 60) : 540])}
        >
          <Icon name="plus-bold" size={16} /> {fn.addReminder}
        </button>
      )}
      <p className="reminders__hint mono">{fn.remindersHint}</p>
    </div>
  )
}
