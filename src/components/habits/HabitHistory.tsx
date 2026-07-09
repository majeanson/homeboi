import { useLang, useT } from '../../i18n'
import { deriveProgress, type Habit, type HabitDay } from '../../lib/habits'

// A habit's own history, expanded under its row: this week as seven dots, plus one
// gentle derived line. Per habit, never across habits, never against another
// member — and never a chain ("best run"), a rank, or a grade. The dots say what
// happened; an untouched day is blank, not a miss.
export function HabitHistory({ habit, days, today }: { habit: Habit; days: HabitDay[]; today: number }) {
  const t = useT()
  const fn = t.habits
  const { lang } = useLang()
  const p = deriveProgress(habit, days, today)

  const dayLetter = (day: number) =>
    new Date(day * 1000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'narrow' })

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
              (d.day === today ? ' is-today' : '')
            }
          >
            <span className="habit-history__letter mono" aria-hidden="true">
              {dayLetter(d.day)}
            </span>
          </li>
        ))}
      </ol>
      <p className="habit-history__line mono">
        {fn.weekDone(p.weekDone)} · {fn.monthDone(p.monthDone)}
      </p>
    </div>
  )
}
