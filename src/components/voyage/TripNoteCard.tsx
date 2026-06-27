import { useT } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { ZoomableImg } from '../ZoomableImg'
import { RowActions } from '../RowActions'
import { InlineIcon } from '../Icon'
import { tripCategoryIcon, type TripNote } from './voyage'

// One « Voyage » info/itinerary entry: an optional category glyph + label, the text,
// and any attached media (a voice memo plays inline; a drawing/photo zooms). Mirrors
// how a fridge/family note renders its media — text-only when there's no blob. The
// 🗑️ (and optional ✏️ for a text edit) come from the shared RowActions.
export function TripNoteCard({
  note,
  who,
  showCategory = true,
  onDelete,
  onEdit,
}: {
  note: TripNote
  /** Resolved member name for a member-scoped note ("kids/parents stuff"). */
  who?: string
  /** Hide the category glyph when the list is already grouped by category. */
  showCategory?: boolean
  onDelete?: () => void
  onEdit?: () => void
}) {
  const t = useT()
  const src = note.media_key ? imgUrl(note.media_key) : null
  return (
    <div className="trip-note">
      <div className="trip-note__body">
        {(note.label || showCategory) && (
          <div className="trip-note__head">
            {showCategory && <InlineIcon name={tripCategoryIcon(note.category)} size={15} />}
            {note.label && <b className="trip-note__label">{note.label}</b>}
            {who && <span className="trip-note__who mono">{who}</span>}
          </div>
        )}
        {note.text && <p className="trip-note__text">{note.text}</p>}
        {src && note.media_kind === 'audio' && (
          <audio className="trip-note__audio" controls preload="none" src={src} aria-label={t.voyage.voiceMemo} />
        )}
        {src && (note.media_kind === 'drawing' || note.media_kind === 'image') && (
          <ZoomableImg src={src} alt={note.label ?? ''} className="trip-note__img" />
        )}
      </div>
      {(onDelete || onEdit) && (
        <RowActions onEdit={onEdit} onDelete={onDelete} deleteLabel={t.common.delete} editLabel={t.common.edit} />
      )}
    </div>
  )
}
