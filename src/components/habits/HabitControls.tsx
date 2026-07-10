import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Cluster } from '../Layout'
import type { Habit, HabitStatus } from '../../lib/habits'

// The per-kind tap controls, extracted out of <HabitRow> so every marking
// surface (the check-in row, the history backfill dots, the calendar day panel)
// shares ONE set of buttons instead of three copies of this switch drifting
// apart. Always a <Cluster> so it wraps instead of bleeding off a phone.
//
// Four kinds, two shapes:
//   • GOAL-shaped — `do` (the whole row is the tap) and `count` (＋1 toward a
//     target, with a quiet − corrector).
//   • CONFIRMATION-shaped — `limit` (＋1 against a soft ceiling; going over reads
//     « C'est noté », never red, never a lecture) and `avoid` (« Tenu » / « Petit
//     écart » — neither styled as failure).
//
// A `do` habit on an INTRA-DAY rhythm (« 3 fois par jour », « aux 4 h ») asks for
// several moments, so it borrows the counted ＋1/− pair rather than a single
// toggle: one tap must not settle a day that wanted four.

export interface HabitControlsProps {
  habit: Habit
  status: HabitStatus
  /** Write an ABSOLUTE per-day value (never a delta — the outbox may replay). */
  onMark: (next: { value: number; slips?: number }) => void
  className?: string
}

export function HabitControls({ habit, status, onMark, className }: HabitControlsProps) {
  const t = useT()
  const fn = t.habits
  const { kind } = habit
  const tallied = kind === 'count' || kind === 'limit' || (kind === 'do' && status.goal > 1)

  return (
    <Cluster className={'habit-row__actions' + (className ? ' ' + className : '')} role="group" aria-label={habit.title}>
      {kind === 'do' && status.goal === 1 && (
        <button
          type="button"
          className={'btn habit-row__do' + (status.done ? ' is-on' : '')}
          aria-pressed={status.done}
          onClick={() => onMark({ value: status.done ? 0 : 1 })}
        >
          <Icon name="check-bold" size={18} /> {status.done ? fn.doneToday : fn.markDone}
        </button>
      )}

      {tallied && (
        <>
          {/* ＋1 comes FIRST and the corrector never appears/disappears beside it:
              tallying is a repeated tap (eight glasses, five cigarettes), so the
              primary button must not shift under the finger between taps. − is
              always rendered, merely disabled at zero. */}
          <button type="button" className="btn habit-row__plus" onClick={() => onMark({ value: status.value + 1 })}>
            <Icon name="plus-bold" size={18} /> {fn.plusOne}
          </button>
          <button
            type="button"
            className="btn btn--ghost habit-row__minus"
            aria-label={fn.minusOne}
            disabled={status.value === 0}
            onClick={() => onMark({ value: Math.max(0, status.value - 1) })}
          >
            <Icon name="minus-bold" size={16} />
          </button>
          {/* A ceiling habit needs a way to say « aucune aujourd'hui » — else a
              zero day is indistinguishable from an untouched one. Last in the
              row, so it can drop away once marked without moving ＋ or −. */}
          {kind === 'limit' && !status.marked && (
            <button type="button" className="btn btn--ghost" onClick={() => onMark({ value: 0 })}>
              {fn.noneToday}
            </button>
          )}
        </>
      )}

      {kind === 'avoid' && (
        <>
          <button
            type="button"
            className={'btn habit-row__held' + (status.done ? ' is-on' : '')}
            aria-pressed={status.done}
            onClick={() => onMark({ value: 1, slips: 0 })}
          >
            <Icon name="check-bold" size={18} /> {fn.held}
          </button>
          <button
            type="button"
            className="btn btn--ghost habit-row__slip"
            onClick={() => onMark({ value: 0, slips: status.slips + 1 })}
          >
            {fn.slip}
          </button>
        </>
      )}
    </Cluster>
  )
}
