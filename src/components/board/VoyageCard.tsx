import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { daysUntilLocal, todayLocalDay } from '../../lib/localDay'
import { useTrips, useSharedTrips, VOYAGE_ICON } from '../voyage/voyage'
import { Chip } from '../Chip'
import { imgUrl } from '../../lib/image'
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
  const all = [
    ...(data?.trips ?? []).map((tr) => ({ ...tr, shared: false })),
    ...(sharedData?.trips ?? []).map((tr) => ({ ...tr, shared: true })),
  ]
  const dated = all
    .filter((tr) => tr.end_at != null && tr.start_at != null && tr.end_at >= today)
    .sort((a, b) => (a.start_at ?? 0) - (b.start_at ?? 0))
  // A trip with no dates yet — « on veut aller en Gaspésie, un jour » — used to be
  // filtered out here, and this card plus /search were the only two places trips are
  // listed at all. So you could create one, close the scene, and never find it again
  // unless you remembered its name well enough to search it (REVIEW-PASS « voy »).
  //
  // Requiring dates would have been the wrong fix: an early idea legitimately has none,
  // and forcing a made-up date to keep the trip visible is worse than no date.
  //
  // They fill the REMAINDER, never displace a real upcoming trip — a household with
  // five someday-ideas must not lose next week's departure off the bottom of a
  // three-row card. Newest first, since an undated trip has nothing else to sort by.
  const undated = all
    .filter((tr) => tr.start_at == null || tr.end_at == null)
    .sort((a, b) => b.created_at - a.created_at)
  const rows = [...dated, ...undated].slice(0, 3)
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
                {/* The trip's cover, if it has one — the ONE place it shows. The column
                    was read + PATCH-accepted since the feature shipped but had no picker
                    and no display, so it could never be anything but null. It lives
                    INSIDE the name (not as a third row child): the row is
                    `justify-content: space-between`, which would have pushed the picture
                    to one edge and the title to the middle, away from each other.
                    Decorative — alt="" — the title carries the meaning. */}
                {tr.media_key && <img src={imgUrl(tr.media_key)} alt="" className="voyage-card__cover" />}
                {tr.title}
                {tr.shared && (
                  <Chip icon="users-three-bold" className="voyage-card__shared">
                    {t.sharedVoyage.badge}
                  </Chip>
                )}
              </span>
              <span className="voyage-card__when mono">
                {tr.destination ? `${tr.destination} · ` : ''}
                {/* No dates yet → say so plainly rather than compute a countdown from
                    a null (which read « dans NaN jours » in the first draft). */}
                {tr.start_at != null && tr.end_at != null
                  ? whenLabel(tr.start_at, tr.end_at)
                  : t.voyage.noDatesYet}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </BoardCard>
  )
}
