import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useT } from '../i18n'

// The one shared commit bar for every edit/create form. Before this, each form
// hand-rolled its footer: Save was `btn--primary` in some and a quiet `.btn` in
// others, and a destructive Delete lived in the footer for one form but nowhere for
// its siblings (you had to back out to the row). FormFooter fixes both: Save is the
// single primary everywhere, Cancel is the ghost beside it, and an optional Delete
// sits separated to the LEFT (quiet + warn) so it's never a same-weight peer of Save.
//
// Save defaults to `type="submit"` (forms that own an `onSubmit`); pass
// `saveType="button"` + `onSave` for a form that commits via a handler (no <form>).
// Heavy deletes stay the caller's call — pass an `onDelete` already wrapped in
// `useConfirm` (destructive) or the undo toast (light), exactly as the forms do today.
export function FormFooter({
  saveLabel,
  saveType = 'submit',
  onSave,
  saveDisabled,
  busy,
  onCancel,
  cancelLabel,
  onDelete,
  deleteLabel,
  saveIcon = 'check-bold',
}: {
  saveLabel: ReactNode
  saveType?: 'submit' | 'button'
  // Used only when saveType === 'button'.
  onSave?: () => void
  saveDisabled?: boolean
  busy?: boolean
  onCancel?: () => void
  cancelLabel?: ReactNode
  // Given → a separated destructive Delete on the left. Caller owns the confirm.
  onDelete?: () => void
  deleteLabel?: ReactNode
  // A leading glyph on Save (null to omit). Defaults to the check tick.
  saveIcon?: IconName | null
}) {
  const t = useT()
  return (
    <div className="form-footer">
      {onDelete && (
        <button
          type="button"
          className="btn btn--ghost btn--sm form-footer__del"
          disabled={busy}
          onClick={onDelete}
        >
          <Icon name="trash-bold" size={16} /> {deleteLabel ?? t.common.delete}
        </button>
      )}
      <div className="form-footer__main">
        {onCancel && (
          <button type="button" className="btn btn--ghost mono" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t.common.cancel}
          </button>
        )}
        <button
          type={saveType}
          className="btn btn--primary"
          disabled={saveDisabled || busy}
          onClick={saveType === 'button' ? onSave : undefined}
        >
          {saveIcon && (
            <>
              <Icon name={saveIcon} size={18} />{' '}
            </>
          )}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
