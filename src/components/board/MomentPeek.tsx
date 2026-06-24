import { useNavigate } from 'react-router-dom'
import { timeOfDay } from '../../lib/timeofday'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

// The board's one entry into « Moments » (the /moment recap + handoff scene) — a
// calm, time-aware ghost button on the status row. « Moments » is a SCENE you zoom
// into, not a glance view, so this is how you reach it now that it's off the toggle:
//   • evening (~17 h on) → « Demain en bref » (scope=tomorrow): the nightly "what's
//     tomorrow / what do we prep" nudge.
//   • daytime → « Moments » (scope=tonight): pick a window (ce soir, demain, une
//     date, la semaine) and see everything coming, with each day's handoff checklist.
// One quiet button, smarter label by time of day. Parent-only (rendered in the
// parent board body); it never shouts.
export function MomentPeek() {
  const t = useT()
  const nav = useNavigate()
  const evening = timeOfDay(Date.now()) === 'evening'
  const scope = evening ? 'tomorrow' : 'tonight'
  return (
    <button
      type="button"
      className="btn btn--ghost mono moment-peek"
      onClick={() => nav(`/moment?scope=${scope}`)}
    >
      <Icon name={evening ? 'moon-stars-bold' : 'sun-horizon-bold'} size={18} />{' '}
      {evening ? t.moment.peek : t.moment.title}
      <Icon name="caret-right-bold" size={16} />
    </button>
  )
}
