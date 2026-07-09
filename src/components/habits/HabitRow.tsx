import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Cluster } from '../Layout'
import type { Habit, HabitStatus } from '../../lib/habits'

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
  const sub = (() => {
    if (kind === 'count') return fn.ofTarget(status.value, target, habit.unit)
    if (kind === 'limit') return over ? fn.noted : fn.ofCeiling(status.value, target, habit.unit)
    if (kind === 'avoid') return status.slips > 0 ? fn.slipped : status.marked ? fn.held : fn.avoidHint
    return habit.cadence === 'week' && status.remainingWeek > 0 ? fn.remainingWeek(status.remainingWeek) : ''
  })()

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

      {!readOnly && (
        <Cluster className="habit-row__actions" role="group" aria-label={habit.title}>
          {kind === 'do' && (
            <button
              type="button"
              className={'btn habit-row__do' + (status.done ? ' is-on' : '')}
              aria-pressed={status.done}
              onClick={() => onMark({ value: status.done ? 0 : 1 })}
            >
              <Icon name="check-bold" size={18} /> {status.done ? fn.doneToday : fn.markDone}
            </button>
          )}

          {(kind === 'count' || kind === 'limit') && (
            <>
              {/* ＋1 comes FIRST and the corrector never appears/disappears beside
                  it: tallying is a repeated tap (eight glasses, five cigarettes),
                  so the primary button must not shift under the finger between
                  taps. − is always rendered, merely disabled at zero. */}
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
      )}
    </div>
  )
}
