import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { useARegler, frictionRow } from '../../lib/aRegler'
import { Icon } from '../Icon'

// « À régler » — a quiet board card surfacing the cross-domain heads-up scan: a short
// list of frictions worth sorting (a ride with no driver, an empty supper, a birthday
// with no gift idea…), each tappable through to « Cette semaine » where the full list
// + fixes live. Renders NOTHING when there's nothing to sort — a calm, finite card
// that empties and stays empty (NFR-CALM), never a nagging badge.
//
// Parent-mobile only (gated by the caller): the fixes are operator writes, so a
// locked kiosk / toddler / guest never sees it (and the endpoint is operator-only).
export function ARegler({ enabled }: { enabled: boolean }) {
  const t = useT()
  const { data } = useARegler(enabled)
  const signals = data?.signals ?? []
  if (!enabled || signals.length === 0) return null
  const top = signals.slice(0, 2)
  const rest = signals.length - top.length
  return (
    <Link to="/settings?tab=week" className="a-regler" aria-label={`${t.aRegler.title} (${signals.length})`}>
      <div className="a-regler__head mono">
        <Icon name="warning-bold" size={15} />
        <span className="a-regler__title">{t.aRegler.title}</span>
        <span className="a-regler__count">{signals.length}</span>
      </div>
      <ul className="a-regler__list">
        {top.map((f) => {
          const r = frictionRow(f, t)
          return (
            <li key={f.key} className="a-regler__row">
              <Icon name={r.icon} size={15} /> <span>{r.text}</span>
            </li>
          )
        })}
        {rest > 0 && <li className="a-regler__more mono">{t.aRegler.more(rest)}</li>}
      </ul>
    </Link>
  )
}
