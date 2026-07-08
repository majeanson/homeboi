import { useT } from '../i18n'
import { isGuest } from '../lib/device'
import { Icon } from './Icon'

// The ONE affordance every manageable row uses: icon-only edit + delete, the
// same two Phosphor glyphs (pencil-simple-bold / trash-bold) everywhere, so the
// app stops mixing "Modifier", "Retirer", a bare ✕ and a text "Supprimer". Both
// icons carry an aria-label (the glyph alone has aria-hidden), and the hit
// target is a comfortable ≥40px for a wall tablet and a toddler-proof thumb.
//
// Pass only the actions a row supports — an edit-less entity simply omits onEdit.
// `editLabel`/`deleteLabel` are the accessible names (entity-specific reads best:
// "Modifier la corvée"); they default to the generic verbs.
export function RowActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  size = 18,
  className,
  readOnly,
}: {
  onEdit?: () => void
  onDelete?: () => void
  editLabel?: string
  deleteLabel?: string
  size?: number
  className?: string
  /** Hide the edit/delete affordances entirely. Defaults to the read-only guest
   *  session, so a babysitter never sees a ✏️/🗑️ on any row app-wide. */
  readOnly?: boolean
}) {
  const t = useT()
  if (readOnly ?? isGuest()) return null
  return (
    <span className={'row-actions' + (className ? ` ${className}` : '')}>
      {onEdit && (
        <button
          type="button"
          className="row-actions__btn"
          onClick={onEdit}
          aria-label={editLabel ?? t.common.edit}
          title={editLabel ?? t.common.edit}
        >
          <Icon name="pencil-simple-bold" size={size} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="row-actions__btn row-actions__btn--danger"
          onClick={onDelete}
          aria-label={deleteLabel ?? t.common.delete}
          title={deleteLabel ?? t.common.delete}
        >
          <Icon name="trash-bold" size={size} />
        </button>
      )}
    </span>
  )
}
