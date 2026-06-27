import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { daysUntilLocal, todayLocalDay } from '../../lib/localDay'
import { useTrips, VOYAGE_ICON } from '../voyage/voyage'
import { BoardCard } from './BoardCard'

// The board « Prochain voyage » glance — the next upcoming (or in-progress) trip, the
// calm heads-up a calendar dot can't give. Reads the SAME /api/trips model as the
// trip scene (shared key). Renders NOTHING when no trip is upcoming, so a household
// with nothing planned never sees this card (calm — no counts, no streak, just the
// next trip). Each row taps into its trip notebook.
export function VoyageCard() {
  const t = useT()
  const { data } = useTrips()
  const today = todayLocalDay()
  // Upcoming or under way: a dated trip whose last day is today or later. Soonest first.
  const trips = (data?.trips ?? [])
    .filter((tr) => tr.end_at != null && tr.start_at != null && tr.end_at >= today)
    .sort((a, b) => (a.start_at ?? 0) - (b.start_at ?? 0))
    .slice(0, 3)
  if (trips.length === 0) return null

  const whenLabel = (start: number, end: number): string => {
    if (start <= today && end >= today) return t.voyage.ongoing
    const days = daysUntilLocal(start)
    return days <= 0 ? t.voyage.startsToday : t.voyage.inDays(days)
  }

  return (
    <BoardCard className="voyage-card" icon={VOYAGE_ICON} label={t.voyage.nextTrip}>
      <ul className="voyage-card__list">
        {trips.map((tr) => (
          <li key={tr.id} className="voyage-card__row">
            <Link to={`/voyage/${tr.id}`} className="voyage-card__open">
              <span className="voyage-card__name">{tr.title}</span>
              <span className="voyage-card__when mono">
                {tr.destination ? `${tr.destination} · ` : ''}
                {whenLabel(tr.start_at as number, tr.end_at as number)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </BoardCard>
  )
}
