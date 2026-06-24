import { useProfile } from '../../lib/profile'
import { imgUrl } from '../../lib/image'
import { type BoardView } from '../../lib/boardview'
import { Icon, type IconName } from '../Icon'
import { MemberSwitcher as FaceSwitcher } from '../MemberSwitcher'
import { type Dict, type Member } from './types'

// A tiny segmented control in the board header — a clean binary: « Grille » (today)
// ⟷ « Mois » (the calendar). The per-person split is the face picker beside it, the
// windowed recap is the « Moments » button — neither is a layout here. Calm and
// small; the choice is remembered per device.
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
    { v: 'month', icon: 'calendar-dots-bold', label: t.boardView.month },
  ]
  return (
    <div className={'boardview' + (armed ? ' help-armed' : '')} role="group" aria-label={t.boardView.label} data-tour="board-views">
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

// The kiosk member switcher: a calm face row bound to the device profile
// (lib/profile) — the same identity the mobile chip sets. "Maisonnée" (everyone) is
// the default neutral mode; tapping a face personalizes as that member; re-tapping
// it, or Maisonnée, returns to everyone. The face row itself is the shared
// MemberSwitcher (components/MemberSwitcher); this only wires the profile + maps the
// board's snake_case members to its normalized face shape.
export function MemberSwitcher({ members, t }: { members: Member[]; t: Dict }) {
  const { memberId, setMemberId } = useProfile()
  return (
    <FaceSwitcher
      faces={members.map((m) => ({
        id: m.id,
        name: m.display_name,
        colour: m.colour,
        photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
      }))}
      value={memberId}
      onChange={setMemberId}
      allLabel={t.profile.household}
      ariaLabel={t.profile.switch}
    />
  )
}
