import { useState } from 'react'
import { useLang, useT } from '../../i18n'
import { capitalize } from '../../lib/format'
import { deriveProgress, habitStatusOn, useMarkHabit, type Habit, type HabitDay } from '../../lib/habits'
import { HabitControls } from './HabitControls'

// A habit's own history, expanded under its row: this week as seven dots, plus one
// gentle derived line. Per habit, never across habits, never against another
// member — and never a chain ("best run"), a rank, or a grade. The dots say what
// happened; an untouched day is blank, not a miss.
//
// « J'ai oublié hier » — a past (or today's) dot is tappable: it SELECTS that day
// and reveals its marking controls beneath, reusing the same per-kind <HabitControls>
// the check-in row uses (via the shared useMarkHabit write). A tap never marks by
// itself — it only opens the controls, so a mis-tap can't log a cigarette. A future
// dot, or any dot while read-only (guest), isn't tappable at all.
export function HabitHistory({
  habit,
  days,
  today,
  readOnly,
}: {
  habit: Habit
  days: HabitDay[]
  today: number
  readOnly?: boolean
}) {
  const t = useT()
  const fn = t.habits
  const { lang } = useLang()
  const markHabit = useMarkHabit()
  const p = deriveProgress(habit, days, today)
  const [selected, setSelected] = useState<number | null>(null)

  const dayLetter = (day: number) =>
    new Date(day * 1000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'narrow' })
  const dayLong = (day: number) =>
    capitalize(new Date(day * 1000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long', day: 'numeric', month: 'long' }))

  const toggleDay = (day: number) => {
    if (readOnly || day > today) return
    setSelected((cur) => (cur === day ? null : day))
  }

  const selStatus = selected != null ? habitStatusOn(habit, days, selected) : null

  return (
    <div className="habit-history">
      <ol className="habit-history__week" aria-label={fn.thisWeek}>
        {p.week.map((d) => (
          <li
            key={d.day}
            className={
              'habit-history__dot' +
              (d.done ? ' is-done' : '') +
              (d.marked && !d.done ? ' is-marked' : '') +
              (d.future ? ' is-future' : '') +
              (d.day === today ? ' is-today' : '') +
              (selected === d.day ? ' is-selected' : '')
            }
          >
            <button
              type="button"
              className="habit-history__dotbtn"
              disabled={readOnly || d.future}
              aria-pressed={selected === d.day}
              aria-label={dayLong(d.day)}
              onClick={() => toggleDay(d.day)}
            >
              <span className="habit-history__letter mono" aria-hidden="true">
                {dayLetter(d.day)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="habit-history__line mono">
        {fn.weekDone(p.weekDone)} · {fn.monthDone(p.monthDone)}
      </p>
      {selected != null && selStatus && (
        <div className="habit-history__markday">
          <p className="habit-history__markday-date mono">{dayLong(selected)}</p>
          <HabitControls habit={habit} status={selStatus} onMark={(next) => markHabit(habit, selected, next)} />
        </div>
      )}
    </div>
  )
}
