import { useT } from '../../i18n'
import { useProfile } from '../../lib/profile'
import { useHabits, dueToday, habitReading, habitStatusOn, habitToday } from '../../lib/habits'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { BoardCard } from './BoardCard'

// The board's « Mes habitudes » glance — a door to « Le point du jour », and a
// reading of what today is still asking. Each habit still due is named with the
// same quiet line the check-in row uses (« 0 sur 2 verres »), so the card answers
// at a glance instead of only promising that something waits.
//
// Privacy is the face filter, not a blur: `dueToday` shows the maisonnée's habits
// plus the PICKED face's own — never another member's. Standing at the tablet as
// « Maisonnée » you see only household habits; picking your face shows yours, the
// same set the check-in scene names. Never a count, never a rank.
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
  // Tell the slot BEFORE returning null: a null render is indistinguishable from a card
  // that is still loading, and the slot has to know which (lib/useReportEmpty).
  const empty = due.length === 0
  useReportEmpty(empty)
  if (empty) return null

  return (
    <BoardCard
      to="/board/habitudes"
      className="habitudes-card"
      icon="repeat-bold"
      label={fn.title}
      ariaLabel={fn.checkin}
      // How many are still asking — of the habits this face may already see below.
      // Never per-person, never a streak or a rank (calm).
      compactHint={String(due.length)}
    >
      <ul className="habitudes-card__list">
        {due.map((h) => {
          const reading = habitReading(h, habitStatusOn(h, days, today), fn)
          return (
            <li key={h.id} className="habitudes-card__row">
              <span className="habitudes-card__ico" aria-hidden="true">
                {h.icon || '•'}
              </span>
              <span className="habitudes-card__title">{h.title}</span>
              {reading && <span className="habitudes-card__sub mono">{reading}</span>}
            </li>
          )
        })}
      </ul>
    </BoardCard>
  )
}
