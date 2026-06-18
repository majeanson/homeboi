import { useProfile } from '../../lib/profile'
import { imgUrl } from '../../lib/image'
import { type BoardView } from '../../lib/boardview'
import { Icon, type IconName } from '../Icon'
import { type Dict, type Member } from './types'

// A tiny segmented control in the board header: bento (grid) · next (focus) ·
// lanes (per-person). Calm and small; the choice is remembered per device.
export function BoardViewToggle({
  view,
  onChange,
  t,
  pick,
  armed,
}: {
  view: BoardView
  onChange: (v: BoardView) => void
  t: Dict
  // Optional help-mode wrapper (lib/helpMode): when armed, a tap explains the view
  // instead of switching to it. Returns the onClick to use. Omit for normal use.
  pick?: (key: string, run: () => void) => () => void
  // When help mode is armed, highlight the options as "tap me to learn".
  armed?: boolean
}) {
  const opts: { v: BoardView; icon: IconName; label: string }[] = [
    { v: 'bento', icon: 'calendar-blank-bold', label: t.boardView.bento },
    { v: 'next', icon: 'clock-bold', label: t.boardView.next },
    { v: 'lanes', icon: 'smiley-bold', label: t.boardView.lanes },
    { v: 'month', icon: 'calendar-dots-bold', label: t.boardView.month },
  ]
  return (
    <div className={'boardview' + (armed ? ' help-armed' : '')} role="group" aria-label={t.boardView.label}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          className={'boardview__opt' + (view === o.v ? ' is-on' : '')}
          aria-pressed={view === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={pick ? pick('view-' + o.v, () => onChange(o.v)) : () => onChange(o.v)}
        >
          <Icon name={o.icon} size={18} />
          <span className="boardview__label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// The kiosk member switcher: a calm face row. "Maisonnée" (everyone) is the
// default neutral mode; tapping a face acts/personalizes as that member; tapping
// the active face again, or Maisonnée, returns to everyone. Uses the device
// profile (lib/profile) — the same identity the mobile chip sets.
export function MemberSwitcher({ members, t }: { members: Member[]; t: Dict }) {
  const { memberId, setMemberId } = useProfile()
  return (
    <div className="mswitch" role="group" aria-label={t.profile.switch}>
      <button
        type="button"
        className={'mswitch__opt' + (memberId === null ? ' is-on' : '')}
        aria-pressed={memberId === null}
        onClick={() => setMemberId(null)}
      >
        <span className="mswitch__av mswitch__av--all" aria-hidden="true">
          <Icon name="users-three-bold" size={18} />
        </span>
        <span className="mswitch__name">{t.profile.household}</span>
      </button>
      {members.map((m) => {
        const photo = m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null
        const on = m.id === memberId
        return (
          <button
            key={m.id}
            type="button"
            className={'mswitch__opt' + (on ? ' is-on' : '')}
            aria-pressed={on}
            onClick={() => setMemberId(on ? null : m.id)}
          >
            <span className="mswitch__av" style={{ background: photo ? undefined : m.colour }}>
              {photo ? <img src={photo} alt="" /> : (m.display_name[0] ?? '?').toUpperCase()}
            </span>
            <span className="mswitch__name">{m.display_name}</span>
          </button>
        )
      })}
    </div>
  )
}
