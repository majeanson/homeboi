import { useT } from '../../i18n'
import { useSpeak } from '../../lib/speak'
import type { DayNote as DayNoteT, Member } from './types'

// The Aujourd'hui board's note for TODAY — the memo pinned to this day in La
// cuisine (functions/api/day-notes). Read-only here: unlike a fridge note it
// isn't cleared from the wall (it belongs to the day, edited in the kitchen).
// Tinted by who wrote it; toddler taps it to hear it read aloud (NFR-KID-2).
export function DayNote({
  note,
  members,
  toddler,
  label,
}: {
  note: DayNoteT
  members: Member[]
  toddler?: boolean
  // Override the header — e.g. "Note · Demain" when this is tomorrow's prep note.
  label?: string
}) {
  const t = useT()
  const speak = useSpeak()
  const heading = label ?? t.board.dayNote
  const tint = (note.member_id ? members.find((m) => m.id === note.member_id)?.colour : null) ?? '#9BD1C9'
  const style = { '--note-tint': tint } as React.CSSProperties
  return (
    <section className={'notes day-note' + (toddler ? ' notes--kid' : '')} aria-label={heading}>
      <div className="notes__head mono" aria-hidden="true">
        📝 {heading}
      </div>
      <div className="notes__grid">
        {toddler ? (
          <button type="button" className="note-card" style={style} onClick={() => speak(note.text)} aria-label={note.text}>
            <span className="note-card__text">{note.text}</span>
          </button>
        ) : (
          <div className="note-card" style={style}>
            <span className="note-card__text">{note.text}</span>
          </div>
        )}
      </div>
    </section>
  )
}
