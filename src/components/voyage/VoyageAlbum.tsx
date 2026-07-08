import { useT, useLang } from '../../i18n'
import { imgUrl } from '../../lib/image'
import { formatDayLong, capitalize as cap } from '../../lib/format'
import { isPdfKey } from '../../lib/carnets'
import type { Member } from '../../lib/members'
import { Avatar } from '../Avatar'
import { ZoomableImg } from '../ZoomableImg'
import { EmptyState } from '../EmptyState'
import { Cluster } from '../Layout'
import { TripNoteCard } from './TripNoteCard'
import { tripDays, tripDateLabel, type Trip, type TripNote } from './voyage'

// « L'album du voyage » (B-12, bmad/09) — a FINISHED trip re-read as a keepsake,
// not re-opened as a tool. One read-only template over the data the trip already
// holds (D-17: nothing new is written, created_at/date are the index): the photos
// it collected, the days as they happened, the notes worth keeping. Same calm
// paper language as the recipe « Original » view; TripNoteCard is read-only here
// by construction (no onSave/onDelete → no RowActions). The editor stays one
// SceneHead toggle away — the album is the default read, never a lock.
export function VoyageAlbum({ trip, notes, members }: { trip: Trip; notes: TripNote[]; members: Member[] }) {
  const t = useT()
  const { lang } = useLang()

  // The visual summary: every non-PDF photo/drawing the trip collected, whatever
  // its category or day (PDFs are logistics — they stay in the editor's Documents).
  const photos = notes.filter(
    (n) => (n.media_kind === 'image' || n.media_kind === 'drawing') && n.media_key && !isPdfKey(n.media_key),
  )
  // A wordless photo lives in the grid only; a note with words (or a voice memo)
  // reads in its day/notes list — so a captioned photo shows in both, like an album.
  const hasWords = (n: TripNote) => !!(n.text || n.label || n.media_kind === 'audio')
  const days = tripDays(trip.start_at, trip.end_at)
    .map((day) => ({
      day,
      dayNotes: notes.filter((n) => n.date === day && hasWords(n)).sort((a, b) => a.position - b.position),
    }))
    .filter((d) => d.dayNotes.length > 0)
  const infoNotes = notes.filter((n) => n.date == null && n.category !== 'document' && hasWords(n))
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.display_name ?? '' : '')
  const faces = trip.members.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m)

  return (
    <div className="voyage-album">
      <p className="voyage-album__tag mono">{t.voyage.albumTag}</p>
      <h3 className="voyage-album__title">{trip.title}</h3>
      {(trip.destination || trip.start_at != null) && (
        <p className="voyage-album__meta">
          {[trip.destination, tripDateLabel(trip, lang)].filter(Boolean).join(' · ')}
        </p>
      )}
      {faces.length > 0 && (
        <Cluster className="voyage-album__faces" role="group" aria-label={t.voyage.albumWho}>
          <span className="voyage-album__facelabel mono">{t.voyage.albumWho}</span>
          {faces.map((m) => (
            <span key={m.id} className="voyage-album__face">
              <Avatar kind={m.avatar_kind} photo={m.avatar_ref} colour={m.colour} name={m.display_name} size={26} />
              <span>{m.display_name}</span>
            </span>
          ))}
        </Cluster>
      )}

      {photos.length > 0 && (
        <section>
          <h4 className="voyage-album__h">{t.voyage.albumPhotos}</h4>
          <div className="voyage-album__grid">
            {photos.map((n) => (
              <ZoomableImg key={n.id} src={imgUrl(n.media_key!)} alt={n.label ?? ''} className="voyage-album__ph" />
            ))}
          </div>
        </section>
      )}

      {days.map(({ day, dayNotes }) => (
        <section key={day}>
          <h4 className="voyage-album__h">{cap(formatDayLong(day, lang))}</h4>
          {dayNotes.map((n) => (
            <TripNoteCard key={n.id} note={n} who={who(n.member_id)} showCategory={false} />
          ))}
        </section>
      ))}

      {infoNotes.length > 0 && (
        <section>
          <h4 className="voyage-album__h">{t.voyage.albumNotes}</h4>
          {infoNotes.map((n) => (
            <TripNoteCard key={n.id} note={n} who={who(n.member_id)} />
          ))}
        </section>
      )}

      {photos.length === 0 && days.length === 0 && infoNotes.length === 0 && (
        <EmptyState tone="calm">{t.voyage.albumEmpty}</EmptyState>
      )}
    </div>
  )
}
