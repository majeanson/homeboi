import { useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { isGuest } from '../lib/device'
import { Icon, type IconName } from './Icon'
import { EditField } from './EditField'
import { RowActions } from './RowActions'

// The ONE calm check-list row. Layout: [check button] · [inert title (+note)] ·
// [RowActions ✏️/🗑️]. Unlike a giant whole-row button, the check is its OWN tap
// target — tapping the title does nothing, so a glance/scroll on a wall tablet
// can't fire the action by accident. The check is a one-shot "do it" (deferred
// undo handles a mis-tap), NOT a persistent checked/strikethrough state.
//
// ✏️ shows when the row is renameable: pass `onRename` for the built-in inline
// rename, or `renderEdit` to supply a richer editor (e.g. La réserve's location
// picker). 🗑️ shows only when `onDelete` is given — most check-lists drop it
// (clearing IS the check), but Garde-manger "running low" keeps it as the only
// "discard without buying" path.
export function CheckRow({
  item,
  note,
  onCheck,
  checkLabel,
  onRename,
  renderEdit,
  onDelete,
  editLabel,
  deleteLabel,
  onExtra,
  extraIcon,
  extraLabel,
  readOnly,
}: {
  item: string
  note?: ReactNode
  onCheck: () => void
  checkLabel: string
  onRename?: (text: string) => void
  renderEdit?: (close: () => void) => ReactNode
  onDelete?: () => void
  editLabel?: string
  deleteLabel?: string
  /** Optional secondary action shown as a compact icon button before ✏️/🗑️ — e.g.
   *  La réserve's "→ add to the shopping list" (#41). Omit it and nothing renders. */
  onExtra?: () => void
  extraIcon?: IconName
  extraLabel?: string
  /** Drop the check + edit/delete affordances, leaving an inert read-only row.
   *  Defaults to the read-only guest session. */
  readOnly?: boolean
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item)
  const canEdit = !!onRename || !!renderEdit
  const ro = readOnly ?? isGuest()

  // Guest / read-only: the row is a calm, inert label — no check button (the check
  // is a write), no ✏️/🗑️. Placed after the hooks (rules-of-hooks).
  if (ro) {
    return (
      <li className="kitchen__pantry-row">
        <span className="checkrow__body">
          <span className="checkrow__title">{item}</span>
          {note && <span className="kitchen__low-note mono">{note}</span>}
        </span>
      </li>
    )
  }

  if (editing) {
    if (renderEdit)
      return <li className="kitchen__pantry-row">{renderEdit(() => setEditing(false))}</li>
    return (
      <li className="kitchen__pantry-row">
        <EditField
          value={text}
          onChange={setText}
          onSubmit={(v) => {
            onRename?.(v)
            setEditing(false)
          }}
          onCancel={() => {
            setText(item)
            setEditing(false)
          }}
          submitIcon="check-bold"
          ariaLabel={t.common.edit}
          autoFocus
          className="checkrow__edit"
        />
      </li>
    )
  }

  return (
    <li className="kitchen__pantry-row">
      <button type="button" className="checkrow__check" onClick={onCheck} aria-label={checkLabel}>
        <span className="board__check" aria-hidden="true">
          <Icon name="square-bold" size={18} />
        </span>
      </button>
      <span className="checkrow__body">
        <span className="checkrow__title">{item}</span>
        {note && <span className="kitchen__low-note mono">{note}</span>}
      </span>
      {onExtra && extraIcon && (
        <span className="row-actions">
          <button
            type="button"
            className="row-actions__btn"
            onClick={onExtra}
            aria-label={extraLabel}
            title={extraLabel}
          >
            <Icon name={extraIcon} size={18} />
          </button>
        </span>
      )}
      {(canEdit || onDelete) && (
        <RowActions
          onEdit={
            canEdit
              ? () => {
                  setText(item)
                  setEditing(true)
                }
              : undefined
          }
          onDelete={onDelete}
          editLabel={editLabel}
          deleteLabel={deleteLabel}
        />
      )}
    </li>
  )
}
