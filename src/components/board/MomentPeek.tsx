import { useNavigate } from 'react-router-dom'
import { timeOfDay } from '../../lib/timeofday'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

type Scope = 'tonight' | 'tomorrow' | 'date' | 'week'

// The board's entry into « Moments » (the /moment recap + handoff scene), as a
// hero-style card in the status band beside « À régler » — same card look + height as
// the supper/weather heroes. « Moments » is a SCENE you zoom into, so the card lists
// its four windows as DIRECT tap targets: each chip deep-links straight to that scope
// (« ce soir » · « demain » · « une date » · « la semaine ») instead of one button you
// then re-pick inside. The contextually-relevant window — tonight by day, tomorrow in
// the evening — is emphasized so the glance still suggests "what to look at now".
// Parent-only (rendered in the parent board body).
export function MomentPeek() {
  const t = useT()
  const nav = useNavigate()
  const evening = timeOfDay(Date.now()) === 'evening'
  const lead: Scope = evening ? 'tomorrow' : 'tonight'
  const windows: { k: Scope; label: string }[] = [
    { k: 'tonight', label: t.moment.scope.tonight },
    { k: 'tomorrow', label: t.moment.scope.tomorrow },
    { k: 'date', label: t.moment.scope.date },
    { k: 'week', label: t.moment.scope.week },
  ]
  return (
    <div className="now-card now-card--moment">
      <div className="blob" />
      <div className="label">
        <Icon name={evening ? 'moon-stars-bold' : 'sun-horizon-bold'} size={13} /> {t.moment.title}
      </div>
      <div className="now-card--moment__windows" role="group" aria-label={t.moment.title}>
        {windows.map((w) => (
          <button
            key={w.k}
            type="button"
            className={'moment-chip' + (w.k === lead ? ' is-lead' : '')}
            onClick={() => nav(`/moment?scope=${w.k}`)}
            aria-label={`${t.moment.title} · ${w.label}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="icn" aria-hidden="true">
        <Icon name={evening ? 'moon-stars-bold' : 'sun-horizon-bold'} size={30} />
      </div>
    </div>
  )
}
