import { Icon } from '../Icon'
import { SLOT_ICON_NAME } from '../../lib/mealSlots'
import { type Dot } from './dayLines'

// ONE marker, drawn. Lifted out of MonthView's cell on 2026-09-15 alongside
// `linesFor`, for the same reason: « La semaine » needed to draw the same things,
// and a second copy of this switch is a second place for a new dated kind to be
// forgotten. `linesFor` decides WHAT a day holds; this decides what one of them
// LOOKS like. Together they are the whole of "a day, rendered".
//
// The vocabulary is shape-coded on purpose (the legend under the month grid is its
// key): filled shapes for things someone scheduled, a ring for a note, and a real
// glyph wherever the kind carries more than a colour — the meal's own slot icon
// (egg/fork/cookie/bowl, straight from Réglages ▸ Repas), a check for a todo, a cake
// for a birthday, a clock for an « L'auto » work window, a receipt for a virement.
// Colour still carries WHO (events) or WHICH SLOT (meals).
//
// `className` is how a surface adds its own weight class — MonthView passes its
// lens `is-lit`/`is-dim`; the week passes nothing. Presentational throughout
// (`aria-hidden` belongs on the CONTAINER, since a lone marker says nothing on its
// own — the label beside it is the accessible text).
export function DayMark({ dot, size = 12, className = '' }: { dot: Dot; size?: number; className?: string }) {
  if (dot.kind === 'meal' && dot.slot) {
    return (
      <span className={'monthv__dot-icon' + className}>
        <Icon name={SLOT_ICON_NAME[dot.slot]} size={size} color={dot.color} />
      </span>
    )
  }
  if (dot.kind === 'todo') {
    return (
      <span className={'monthv__dot-icon' + className}>
        <Icon name="check-bold" size={size} color={dot.color} />
      </span>
    )
  }
  if (dot.kind === 'birthday') {
    return (
      <span className={'monthv__dot-icon' + className}>
        <Icon name="cake-bold" size={size} color={dot.color} />
      </span>
    )
  }
  if (dot.kind === 'work') {
    return (
      <span className={'monthv__dot-icon' + className}>
        <Icon name="clock-bold" size={size} color={dot.color} />
      </span>
    )
  }
  if (dot.kind === 'transfer') {
    return (
      <span className={'monthv__dot-icon' + className}>
        <Icon name="receipt-bold" size={size} color={dot.color} />
      </span>
    )
  }
  return (
    <span
      className={`monthv__dot monthv__dot--${dot.kind}` + className}
      // A ring (note) is drawn from `color`; filled shapes from `background`.
      style={dot.kind === 'note' ? { color: dot.color } : { background: dot.color }}
    />
  )
}
