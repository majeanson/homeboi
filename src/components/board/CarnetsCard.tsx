import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { useCarnets } from '../../lib/carnets'
import { Icon } from '../Icon'

// The board « Les carnets » glance — the « long jeu » heads-up a calendar can't give:
// a cared-for thing entering (or past) its replacement window. Reads the SAME
// /api/carnets model as the cercle SubTab (shared key). Renders NOTHING when nothing
// is near end-of-life — so a household with only fresh things never sees this card
// (calm). Each row taps through to that carnet's scene.
export function CarnetsCard() {
  const t = useT()
  const c = t.carnets
  // Non-polling (live: false): the long-jeu "soon" set changes over days, and a carnet
  // write invalidates CARNETS_KEY — so this default-on board card doesn't put /api/carnets
  // on the board's poll cadence for every household.
  const { data } = useCarnets({ live: false })
  const soon = data?.soon ?? []
  if (soon.length === 0) return null

  return (
    <div className="carnets-card">
      <div className="sec-label">
        <span className="sec-label__ico" aria-hidden="true">
          <Icon name="book-open-bold" size={16} />
        </span>
        <b>{c.title}</b>
        <span className="ln" />
      </div>
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
      </ul>
    </div>
  )
}
