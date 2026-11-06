import type { CSSProperties, MouseEventHandler } from 'react'
import { Icon } from './Icon'

// THE round check of a row (solidify 3.6, 2026-11-05): `.check` was spelled by hand in
// the activity row (twice), La liste and the todo rows. With `onClick` it is a real
// toggle and `label` names it; without, it is the decoration of a row whose whole body
// is the button. `.check` is owned here (kit-class-rule); the row's own class sets its
// position and size.
export function CheckDisc({
  done,
  onClick,
  label,
  className,
  style,
}: {
  done?: boolean | undefined
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined
  label?: string
  className?: string
  style?: CSSProperties | undefined
}) {
  if (!onClick) {
    return (
      <span className={'check' + (className ? ' ' + className : '')} style={style} aria-hidden="true">
        <Icon name="check-bold" size={18} />
      </span>
    )
  }
  return (
    <button type="button" className={'check' + (className ? ' ' + className : '')} style={style} onClick={onClick} aria-pressed={!!done} aria-label={label}>
      <Icon name="check-bold" size={18} />
    </button>
  )
}
