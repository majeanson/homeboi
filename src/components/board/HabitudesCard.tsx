import { useT } from '../../i18n'
import { useProfile } from '../../lib/profile'
import { useHabits, dueToday, habitStatusOn, habitToday, type Habit } from '../../lib/habits'
import { BoardCard } from './BoardCard'

// The board's « Mes habitudes » glance — a door to « Le point du jour », not a
// second check-in surface. Privacy first (the MotsCard model):
//
//   • HOUSEHOLD habits (member_id null) are named, with a quiet reading of today.
//   • A picked face's OWN habits collapse to ONE presence line (« Tes habitudes
//     t'attendent »). Never a count, never a rank, and never another member's
//     state — whoever is standing at the tablet learns nothing about anyone else.
//
// Self-hides when nothing is asking today (calm: the day empties and stays empty).
export function HabitudesCard() {
  const t = useT()
  const fn = t.habits
  const { memberId: face } = useProfile()
  // Non-polling: a default-on board card must not add /api/habits to the board
  // poll (the free-tier lever). Realtime nudges refresh it on another device's tap.
  const { data } = useHabits({ live: false })
  const today = habitToday()

  const habits = data?.habits ?? []
  const days = data?.days ?? []
  const due = dueToday(habits, days, face, today)
  if (due.length === 0) return null

  const household = due.filter((h) => h.member_id === null)
  const hasMine = due.some((h) => h.member_id !== null)

  // The household row's quiet reading — the same words the check-in scene uses.
  const reading = (h: Habit) => {
    const s = habitStatusOn(h, days, today)
    if (h.kind === 'count') return fn.ofTarget(s.value, s.target ?? 0, h.unit)
    if (h.cadence === 'week' && s.remainingWeek > 0) return fn.remainingWeek(s.remainingWeek)
    return ''
  }

  return (
    <BoardCard
      to="/board/habitudes"
      className="habitudes-card"
      icon="repeat-bold"
      label={fn.title}
      ariaLabel={fn.checkin}
    >
      <ul className="habitudes-card__list">
        {household.map((h) => (
          <li key={h.id} className="habitudes-card__row">
            <span className="habitudes-card__ico" aria-hidden="true">
              {h.icon || '•'}
            </span>
            <span className="habitudes-card__title">{h.title}</span>
            <span className="habitudes-card__sub mono">{reading(h)}</span>
          </li>
        ))}
      </ul>
      {/* Presence only — a boolean dot, like the face row's « un mot t'attend ». */}
      {hasMine && (
        <p className="habitudes-card__mine mono">
          <span className="face-dot" aria-hidden="true" /> {fn.yoursAwait}
        </p>
      )}
    </BoardCard>
  )
}
