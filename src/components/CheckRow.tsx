import { useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'
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
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item)
  const canEdit = !!onRename || !!renderEdit

  if (editing) {
    if (renderEdit)
      return <li className="kitchen__pantry-row">{renderEdit(() => setEditing(false))}</li>
    return (
      <li className="kitchen__pantry-row">
        <form
          className="operator__inline-form"
          style={{ flex: '1 1 auto' }}
          onSubmit={(e) => {
            e.preventDefault()
            onRename?.(text)
            setEditing(false)
          }}
        >
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t.common.edit}
            autoFocus
          />
          <button type="submit" className="btn" disabled={!text.trim()}>
            {t.common.save}
          </button>
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              setText(item)
              setEditing(false)
            }}
          >
            {t.common.cancel}
          </button>
        </form>
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
