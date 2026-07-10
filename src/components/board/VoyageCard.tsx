import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { daysUntilLocal, todayLocalDay } from '../../lib/localDay'
import { useTrips, useSharedTrips, VOYAGE_ICON } from '../voyage/voyage'
import { Chip } from '../Chip'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { BoardCard } from './BoardCard'

// The board « Prochain voyage » glance — the next upcoming (or in-progress) trip, the
// calm heads-up a calendar dot can't give. Reads BOTH the private /api/trips model and
// the cross-household /api/shared-trip store (shared key), merged + sorted together so
// a promoted trip keeps its place in the card. Renders NOTHING when nothing's upcoming,
// so a household with nothing planned never sees this card (calm — no counts, no streak,
// just the next trip). Each row taps into its trip notebook (a shared row → the shared
// scene, with a « Partagé » tag).
export function VoyageCard() {
  const t = useT()
  const { data } = useTrips()
  const { data: sharedData } = useSharedTrips()
  const today = todayLocalDay()

  // Upcoming or under way: a dated trip whose last day is today or later. Private and
  // shared trips carry the same date/title fields, so they merge into one sorted run.
  const rows = [
    ...(data?.trips ?? []).map((tr) => ({ ...tr, shared: false })),
    ...(sharedData?.trips ?? []).map((tr) => ({ ...tr, shared: true })),
  ]
    .filter((tr) => tr.end_at != null && tr.start_at != null && tr.end_at >= today)
    .sort((a, b) => (a.start_at ?? 0) - (b.start_at ?? 0))
    .slice(0, 3)
  const empty = rows.length === 0
  useReportEmpty(empty)
  if (empty) return null

  const whenLabel = (start: number, end: number): string => {
    if (start <= today && end >= today) return t.voyage.ongoing
    const days = daysUntilLocal(start)
    return days <= 0 ? t.voyage.startsToday : t.voyage.inDays(days)
  }

  return (
    // The next trip's own title is the quiet hint — a name, like "Spaghetti" is for a
    // meal card, trivially the first row already sorted to the top.
    <BoardCard
      className="voyage-card"
      icon={VOYAGE_ICON}
      label={t.voyage.nextTrip}
      compactLabel={t.voyage.nextTripShort}
      compactHint={rows[0]?.title}
      // The mini names the next trip; tapping it opens THAT trip's notebook straight away
      // (a shared row → the shared scene) instead of growing to a one-row list of the same
      // thing. The grown card is still there for the rare 2–3 upcoming trips, via the size chip.
      compactTo={rows[0] ? (rows[0].shared ? `/voyage/partage/${rows[0].id}` : `/voyage/${rows[0].id}`) : undefined}
    >
      <ul className="voyage-card__list">
        {rows.map((tr) => (
          <li key={tr.id} className="voyage-card__row">
            <Link to={tr.shared ? `/voyage/partage/${tr.id}` : `/voyage/${tr.id}`} className="voyage-card__open">
              <span className="voyage-card__name">
                {tr.title}
                {tr.shared && (
                  <Chip icon="users-three-bold" className="voyage-card__shared">
                    {t.sharedVoyage.badge}
                  </Chip>
                )}
              </span>
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
