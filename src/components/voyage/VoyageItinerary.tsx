import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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

  // Deep-link from a calendar day / day-page itinerary row: `?jour=N` (1-based
  // day-of-trip) scrolls that day's section into view, so tapping "Musée, 14h" on
  // the 12th lands on day 12 rather than the top of a long multi-day itinerary.
  const [params] = useSearchParams()
  const jour = Number(params.get('jour'))
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!jour || jour < 1) return
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-jour="${jour}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [jour, days.length])

  if (days.length === 0) {
    return <EmptyState tone="calm">{t.voyage.setDatesForItinerary}</EmptyState>
  }

  async function del(n: TripNote) {
    await write('trip-notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [affectedKey] }).catch(() => {})
  }

  return (
    <div className="voyage-itin" ref={rootRef}>
      {days.map((d, i) => {
        const dayNotes = notes.filter((n) => n.date === d)
        return (
          <section key={d} className="voyage-itin__day" data-jour={i + 1}>
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
