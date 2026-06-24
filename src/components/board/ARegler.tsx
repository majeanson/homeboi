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
  // One quiet line: the label + the first friction + a "+N" when there are more.
  // With a SINGLE friction, tap goes straight to its one-tap fix; with several, to
  // « Cette semaine » for the full list. Deliberately compact — it sits above every
  // board view, so it must whisper, not shout.
  const first = frictionRow(signals[0], t)
  const to = signals.length === 1 ? signals[0].href : '/settings?tab=week'
  return (
    <Link to={to} className="a-regler" aria-label={`${t.aRegler.title} (${signals.length})`}>
      <Icon name="warning-bold" size={14} />
      <span className="a-regler__title mono">{t.aRegler.title}</span>
      <span className="a-regler__lead">
        <Icon name={first.icon} size={14} /> {first.text}
      </span>
      {signals.length > 1 && <span className="a-regler__count mono">+{signals.length - 1}</span>}
      <Icon name="caret-right-bold" size={13} />
    </Link>
  )
}
