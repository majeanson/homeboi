import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { HabitControls } from './HabitControls'
import { habitReading, type Habit, type HabitStatus } from '../../lib/habits'

// One habit on the check-in scene. Deliberately BIGGER than the board's <Act> row:
// this is a full-screen, one-tap-at-a-time surface (the « Avant de partir » big-row
// language), reachable by a toddler thumb on a wall tablet.
//
// Four kinds, two shapes:
//   • GOAL-shaped — `do` (the whole row is the tap) and `count` (＋1 toward a
//     target, with a quiet − corrector).
//   • CONFIRMATION-shaped — `limit` (＋1 against a soft ceiling; going over reads
//     « C'est noté », never red, never a lecture) and `avoid` (« Tenu » / « Petit
//     écart » — neither styled as failure).
//
// Every control row is a <Cluster> so it wraps instead of bleeding off a phone.
// Read-only (guest) drops the controls and keeps the reading.

export interface HabitRowProps {
  habit: Habit
  status: HabitStatus
  /** Write an ABSOLUTE per-day value (never a delta — the outbox may replay). */
  onMark: (next: { value: number; slips?: number }) => void
  /** Tap the row body to open its history. */
  onOpen?: () => void
  readOnly?: boolean
}

export function HabitRow({ habit, status, onMark, onOpen, readOnly }: HabitRowProps) {
  const t = useT()
  const fn = t.habits
  const { kind } = habit
  const target = status.target ?? 0
  const over = kind === 'limit' && status.value > target

  // The quiet line under the title: where today stands, in the habit's own words.
  const sub = habitReading(habit, status, fn)

  const cls =
    'habit-row' +
    (status.settled ? ' habit-row--settled' : '') +
    (status.done ? ' habit-row--done' : '') +
    (over ? ' habit-row--over' : '')

  const style = habit.colour ? ({ '--habit-tint': habit.colour } as React.CSSProperties) : undefined

  return (
    <div className={cls} style={style}>
      {/* The body: picto + title + today's quiet reading. Tapping opens the
          history peek — never marks (a mis-tap must not log a cigarette). */}
      <button type="button" className="habit-row__body" onClick={onOpen} disabled={!onOpen}>
        <span className="habit-row__ico" aria-hidden="true">
          {habit.icon || '•'}
        </span>
        <span className="habit-row__text">
          <span className="habit-row__title">{habit.title}</span>
          {sub && <span className="habit-row__sub mono">{sub}</span>}
        </span>
        {status.done && (
          <span className="habit-row__check" aria-hidden="true">
            <Icon name="check-bold" size={18} />
          </span>
        )}
      </button>

      {!readOnly && <HabitControls habit={habit} status={status} onMark={onMark} />}
    </div>
  )
}
