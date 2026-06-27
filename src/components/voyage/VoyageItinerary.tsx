import { useT, useLang } from '../../i18n'
import { useWrite } from '../../lib/write'
import { TRIP_NOTES_KEY } from '../../lib/queryKeys'
import { formatDayLong } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { TripNoteAdd } from './TripNoteAdd'
import { TripNoteCard } from './TripNoteCard'
import { tripDays, type Trip, type TripNote } from './voyage'

// « Voyage » → Itinéraire — the day-by-day plan. One section per day the trip spans
// (start_at..end_at inclusive); each shows that day's entries and a composer that
// writes a dated trip_note (category 'activity'). These dated notes are what the
// calendar band's days and the day-page "Voyage — Jour N" header surface, so the
// same info is there when you open that day. When the trip has no dates yet, prompt
// to set them (the date range is what makes an itinerary).
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function VoyageItinerary({ trip, notes }: { trip: Trip; notes: TripNote[] }) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const affectedKey = [...TRIP_NOTES_KEY, trip.id]
  const days = tripDays(trip.start_at, trip.end_at)

  if (days.length === 0) {
    return <EmptyState tone="calm">{t.voyage.setDatesForItinerary}</EmptyState>
  }

  async function del(n: TripNote) {
    await write('trip-notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [affectedKey] }).catch(() => {})
  }

  return (
    <div className="voyage-itin">
      {days.map((d, i) => {
        const dayNotes = notes.filter((n) => n.date === d)
        return (
          <section key={d} className="voyage-itin__day">
            <div className="sec-label">
              <b>{t.voyage.dayN(i + 1)}</b>
              <span className="voyage-itin__date mono">{cap(formatDayLong(d, lang))}</span>
              <span className="ln" />
            </div>
            {dayNotes.map((n) => (
              <TripNoteCard key={n.id} note={n} onDelete={() => del(n)} />
            ))}
            <TripNoteAdd tripId={trip.id} category="activity" date={d} placeholder={t.voyage.addDayPlan} />
          </section>
        )
      })}
    </div>
  )
}
