import { useNavigate } from 'react-router-dom'
import { timeOfDay } from '../../lib/timeofday'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

// The board's one entry into « Moments » (the /moment recap + handoff scene), as a
// hero-style card in the status band beside « À régler » — same card look + height as
// the supper/weather heroes. « Moments » is a SCENE you zoom into, not a glance view,
// so this is how you reach it now that it's off the toggle. The card name always reads
// « Moments » (so the feature stays discoverable), with a TIME-AWARE sub-line + tap:
//   • evening (~17 h on) → « Demain en bref » (scope=tomorrow): the nightly prep look.
//   • daytime → « Ce soir » (scope=tonight): tonight's recap.
// Inside the scene you pick any window (ce soir · demain · une date · la semaine).
// Parent-only (rendered in the parent board body).
export function MomentPeek() {
  const t = useT()
  const nav = useNavigate()
  const evening = timeOfDay(Date.now()) === 'evening'
  const scope = evening ? 'tomorrow' : 'tonight'
  return (
    <button
      type="button"
      className="now-card now-card--moment moment-peek"
      onClick={() => nav(`/moment?scope=${scope}`)}
      aria-label={`${t.moment.title} — ${evening ? t.moment.peek : t.moment.scope.tonight}`}
    >
      <div className="blob" />
      <div className="label">
        <Icon name={evening ? 'moon-stars-bold' : 'sun-horizon-bold'} size={13} /> {t.moment.title}
      </div>
      <div className="what">{evening ? t.moment.peek : t.moment.scope.tonight}</div>
      <div className="who mono">{t.moment.windows}</div>
      <div className="icn" aria-hidden="true">
        <Icon name={evening ? 'moon-stars-bold' : 'sun-horizon-bold'} size={34} />
      </div>
    </button>
  )
}
