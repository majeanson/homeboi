import { useProfile } from '../../lib/profile'
import { facesFromMembers } from '../../lib/faces'
import { useFaceHasWaiting } from '../../lib/mots'
import { type BoardView } from '../../lib/boardview'
import { Icon, type IconName } from '../Icon'
import { MemberSwitcher as FaceSwitcher } from '../MemberSwitcher'
import { type Dict, type Member } from './types'

// A tiny segmented control in the board header — three zoom levels on the same
// household: « Grille » (today) · « Mois » (the calendar) · « L'année » (the
// horizon of fixed points). The per-person split is the face picker beside it — not a
// layout here. Calm and small; the choice is remembered per device.
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
  // instead of switching to it. Returns the onClick to use. Omit for normal use. The
  // key param is the two BOARD_HELP keys this toggle owns (a subset of the board's
  // help keys), so the surface's narrowed `help.pick` stays contravariantly assignable.
  pick?: (key: 'view-bento' | 'view-month' | 'view-annee', run: () => void) => () => void
  // When help mode is armed, highlight the options as "tap me to learn".
  armed?: boolean
}) {
  const opts: { v: BoardView; k: 'view-bento' | 'view-month' | 'view-annee'; icon: IconName; label: string }[] = [
    { v: 'bento', k: 'view-bento', icon: 'calendar-blank-bold', label: t.boardView.bento },
    { v: 'month', k: 'view-month', icon: 'calendar-dots-bold', label: t.boardView.month },
    { v: 'annee', k: 'view-annee', icon: 'sun-horizon-bold', label: t.boardView.annee },
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
          onClick={pick ? pick(o.k, () => onChange(o.v)) : () => onChange(o.v)}
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
  // A calm presence dot on a face that has « un mot t'attend » — boolean, never a count.
  const hasWaiting = useFaceHasWaiting()
  return (
    <FaceSwitcher
      // The waiting-mot dot is this surface's own accent, layered on the shared mapping.
      faces={facesFromMembers(members).map((f) => ({ ...f, dot: hasWaiting(f.id) }))}
      value={memberId}
      onChange={setMemberId}
      allLabel={t.profile.household}
      ariaLabel={t.profile.switch}
    />
  )
}
