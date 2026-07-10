import { Link } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { useCarnets, warrantyExpiries } from '../../lib/carnets'
import { formatDay } from '../../lib/format'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { BoardCard } from './BoardCard'

// The board « Les carnets » glance — the « long jeu » heads-up a calendar can't give:
// a cared-for thing entering (or past) its replacement window. Reads the SAME
// /api/carnets model as the cercle SubTab (shared key). Renders NOTHING when nothing
// is near end-of-life — so a household with only fresh things never sees this card
// (calm). Each row taps through to that carnet's scene.
export function CarnetsCard() {
  const t = useT()
  const { lang } = useLang()
  const c = t.carnets
  // Non-polling (live: false): the long-jeu "soon" set changes over days, and a carnet
  // write invalidates CARNETS_KEY — so this default-on board card doesn't put /api/carnets
  // on the board's poll cadence for every household.
  const { data } = useCarnets({ live: false })
  const soon = data?.soon ?? []
  // Warranties ending soon — DERIVED from the same carnets model (no rows), the other
  // heads-up a calendar can't give. See warrantyExpiries.
  const warranties = warrantyExpiries(data?.carnets ?? [], Math.floor(Date.now() / 1000))
  const empty = soon.length === 0 && warranties.length === 0
  useReportEmpty(empty)
  if (empty) return null

  // When exactly ONE thing is nearing its end, the mini names it and taps straight to that
  // carnet — the same "don't grow into a one-row list of the same thing" nav voyage uses.
  // With several, the mini lists them and grows so you can pick which.
  const onlyId = soon.length + warranties.length === 1 ? (soon[0]?.carnetId ?? warranties[0]?.carnetId) : undefined

  return (
    <BoardCard
      className="carnets-card"
      icon="book-open-bold"
      label={c.title}
      // Compact: name the things nearing their end rather than counting them — « le
      // chauffe-eau » tells you what to look at; « 2 » doesn't.
      compactItems={[...soon.map((s) => s.name), ...warranties.map((w) => w.name)]}
      compactHint={String(soon.length + warranties.length)}
      compactTo={onlyId ? `/cercle/carnet/${onlyId}` : undefined}
    >
      <ul className="carnets-card__list">
        {soon.map((s) => (
          <li key={s.carnetId} className="carnets-card__row">
            <Link to={`/cercle/carnet/${s.carnetId}`} className="carnets-card__open">
              <span className="carnets-card__name">{s.name}</span>
              <span className="carnets-card__when mono">
                {s.monthsLeft <= 0 ? c.overdue : c.replaceAround(new Date(s.at * 1000).getFullYear())}
              </span>
            </Link>
          </li>
        ))}
        {warranties.map((w) => (
          <li key={`w-${w.carnetId}`} className="carnets-card__row">
            <Link to={`/cercle/carnet/${w.carnetId}`} className="carnets-card__open">
              <span className="carnets-card__name"><span aria-hidden="true">{w.emoji}</span> {w.name}</span>
              <span className="carnets-card__when mono">{c.warrantyEndsOn(formatDay(w.at, lang))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </BoardCard>
  )
}
