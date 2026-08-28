import { useT } from '../i18n'
import { Icon } from './Icon'

/**
 * The ↑/↓ reorder pair — ONE implementation.
 *
 * It existed twice, identically: inside `EditField` (its `reorder` prop) and as a
 * private `ItemReorder` in `operator/todos.tsx`, same markup, same classes, same
 * icons, same disabled logic. The todo-template copy even passed `t.operator.moveUp`
 * / `moveDown` by hand — the exact strings the other one hardcoded.
 *
 * Keyboard/AT note: these are the NON-touch mirror of drag-to-reorder (`usePointerDnd`),
 * so they are not decoration — a hidden or drag-only reorder is unreachable with a
 * mouse or a keyboard, which is the standing desktop-reachability rule.
 *
 * The class names stay `.edit-field__*`: the CSS lives in `styles/pages/fields.css`,
 * `@import` order IS the cascade here, and renaming a working class family to match a
 * component name is churn, not uniformity.
 */
export type ReorderProps = {
  onUp: () => void
  onDown: () => void
  upDisabled?: boolean
  downDisabled?: boolean
  /** Defaults to « Monter » / « Descendre »; override only when the row needs to name what moves. */
  upLabel?: string
  downLabel?: string
}

export function Reorder({ onUp, onDown, upDisabled, downDisabled, upLabel, downLabel }: ReorderProps) {
  const t = useT()
  return (
    <div className="edit-field__reorder">
      <button
        type="button"
        className="edit-field__mini"
        onClick={onUp}
        disabled={upDisabled}
        aria-label={upLabel ?? t.operator.moveUp}
      >
        <Icon name="caret-up-bold" size={16} />
      </button>
      <button
        type="button"
        className="edit-field__mini"
        onClick={onDown}
        disabled={downDisabled}
        aria-label={downLabel ?? t.operator.moveDown}
      >
        <Icon name="caret-down-bold" size={16} />
      </button>
    </div>
  )
}
