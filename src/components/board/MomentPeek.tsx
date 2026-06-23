import { useNavigate } from 'react-router-dom'
import { timeOfDay } from '../../lib/timeofday'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

// A calm, evening-only entry to « Moments ». From ~17 h on it offers a one-tap
// glance at tomorrow (the recap scene, scope=tomorrow) — the nightly "what does
// tomorrow look like / what do we prep tonight" nudge. It renders NOTHING the
// rest of the day, on purpose: Moments is a scene, not a sixth always-on board
// card, so this only surfaces during the wind-down and is dismissed by simply not
// tapping it. Parent-only (it's rendered in the parent board body).
export function MomentPeek() {
  const t = useT()
  const nav = useNavigate()
  if (timeOfDay(Date.now()) !== 'evening') return null
  return (
    <button
      type="button"
      className="btn btn--ghost mono moment-peek"
      onClick={() => nav('/moment?scope=tomorrow')}
    >
      <Icon name="moon-stars-bold" size={18} /> {t.moment.peek}
      <Icon name="caret-right-bold" size={16} />
    </button>
  )
}
