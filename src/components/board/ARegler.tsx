import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { useARegler, frictionRow } from '../../lib/aRegler'
import { Icon } from '../Icon'

// « À régler » — a quiet board card surfacing the cross-domain heads-up scan: a short
// list of frictions worth sorting (a ride with no driver, an empty supper, a birthday
// with no gift idea…), each tappable through to its fix (or « Cette semaine » for the
// full list). Renders NOTHING when there's nothing to sort — a calm, finite card that
// empties and stays empty (NFR-CALM), never a nagging badge.
//
// Parent-mobile only (gated by the caller): the fixes are operator writes, so a
// locked kiosk / toddler / guest never sees it (and the endpoint is operator-only).
//
// Two looks: `chip` (a compact one-liner — used inline, e.g. « Cette semaine ») and
// `card` (a hero-style tile that sits in the board status band beside « Moments »,
// matching the supper/weather heroes' card look + height).
export function ARegler({ enabled, variant = 'chip' }: { enabled: boolean; variant?: 'chip' | 'card' }) {
  const t = useT()
  const { data } = useARegler(enabled)
  const signals = data?.signals ?? []
  if (!enabled || signals.length === 0) return null
  // The first friction is the headline; with a SINGLE friction, tap goes straight to
  // its one-tap fix; with several, to « Cette semaine » for the full list.
  const first = frictionRow(signals[0], t)
  const to = signals.length === 1 ? signals[0].href : '/settings?tab=board&sub=thisweek'
  const aria = `${t.aRegler.title} (${signals.length})`

  // Card: a hero-style tile (marigold = a warm heads-up), label + the lead friction as
  // the headline + a « +N » when there are more, the friction's glyph bottom-right.
  if (variant === 'card') {
    return (
      <Link to={to} className="now-card now-card--regler" aria-label={aria}>
        <div className="blob" />
        <div className="label">
          <Icon name="warning-bold" size={13} /> {t.aRegler.title}
        </div>
        <div className="what">{first.text}</div>
        {signals.length > 1 && <div className="who mono">+{signals.length - 1}</div>}
        <div className="icn" aria-hidden="true">
          <Icon name={first.icon} size={34} />
        </div>
      </Link>
    )
  }

  // Chip: one quiet line — the label + the first friction + a « +N ». Used inline.
  return (
    <Link to={to} className="a-regler" aria-label={aria}>
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
