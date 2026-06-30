import { useState } from 'react'
import { useT } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { ZoomableImg } from '../ZoomableImg'
import { RowActions } from '../RowActions'
import { EditField } from '../EditField'
import { InlineIcon } from '../Icon'
import { tripCategoryIcon, type TripNote } from './voyage'

// One « Voyage » info/itinerary entry: an optional category glyph + label, the text,
// and any attached media (a voice memo plays inline; a drawing/photo zooms). Mirrors
// how a fridge/family note renders its media — text-only when there's no blob. The
// 🗑️ (and ✏️ when `onSave` is given) come from the shared RowActions; ✏️ flips the
// card into an inline EditField (PATCH text) — the same rename gesture every other
// list here uses (MealPool/ReserveSection/PackingList), so a typo'd flight number is
// a fix-in-place, not a delete-and-retype.
export function TripNoteCard({
  note,
  who,
  showCategory = true,
  onDelete,
  onSave,
}: {
  note: TripNote
  /** Resolved member name for a member-scoped note ("kids/parents stuff"). */
  who?: string
  /** Hide the category glyph when the list is already grouped by category. */
  showCategory?: boolean
  onDelete?: () => void
  /** Provided → a ✏️ that inline-edits the note's text (PATCH). */
  onSave?: (text: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const src = note.media_key ? imgUrl(note.media_key) : null

  if (editing && onSave) {
    return (
      <div className="trip-note trip-note--editing">
        <div className="trip-note__body">
          <TripNoteEdit note={note} onSave={onSave} onClose={() => setEditing(false)} />
        </div>
      </div>
    )
  }

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
      {(onDelete || onSave) && (
        <RowActions
          onEdit={onSave ? () => setEditing(true) : undefined}
          onDelete={onDelete}
          deleteLabel={t.common.delete}
          editLabel={t.common.edit}
        />
      )}
    </div>
  )
}

// The inline rename for a trip note's text. Fresh draft per open (keyed on remount
// by the editing flag), Enter / Save commits, Échap / Annuler closes — the same
// EditField inline-edit shape ReserveSection uses for its rows.
function TripNoteEdit({
  note,
  onSave,
  onClose,
}: {
  note: TripNote
  onSave: (text: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(note.text)
  return (
    <EditField
      value={text}
      onChange={setText}
      onSubmit={() => {
        const v = text.trim()
        if (v) onSave(v)
        onClose()
      }}
      submitLabel={t.common.save}
      ariaLabel={t.common.edit}
      autoFocus
      onCancel={onClose}
    />
  )
}
