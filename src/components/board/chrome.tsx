import { Segmented } from '../Segmented'
import { useProfile } from '../../lib/profile'
import { facesFromMembers } from '../../lib/faces'
import { useFaceHasWaiting } from '../../lib/mots'
import { type BoardView } from '../../lib/boardview'
import { type IconName } from '../Icon'
import { MemberSwitcher } from '../MemberSwitcher'
import { type Dict, type Member } from './types'

// A tiny segmented control in the board header — the zoom levels on the same household:
// « Grille » (today) · « La semaine » · « Mois » (the calendar) · « L'année » (the horizon of
// fixed points) · « Tâches ». The per-person split is the face picker beside it — not a
// layout here. Calm and small; the choice is remembered per device.
type ViewHelpKey = 'view-bento' | 'view-semaine' | 'view-month' | 'view-annee' | 'view-taches'
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
  pick?: (key: ViewHelpKey, run: () => void) => () => void
  // When help mode is armed, highlight the options as "tap me to learn".
  armed?: boolean
}) {
  const opts: { v: BoardView; k: ViewHelpKey; icon: IconName; label: string }[] = [
    { v: 'bento', k: 'view-bento', icon: 'calendar-blank-bold', label: t.boardView.bento },
    { v: 'semaine', k: 'view-semaine', icon: 'stack-bold', label: t.boardView.semaine },
    { v: 'month', k: 'view-month', icon: 'calendar-dots-bold', label: t.boardView.month },
    { v: 'annee', k: 'view-annee', icon: 'sun-horizon-bold', label: t.boardView.annee },
    { v: 'taches', k: 'view-taches', icon: 'check-square-bold', label: t.boardView.taches },
  ]
  return (
    <Segmented
      className="boardview"
      collapse
      ariaLabel={t.boardView.label}
      tour="board-views"
      armed={armed}
      value={view}
      onChange={onChange}
      pick={pick ? (key, run) => pick(opts.find((o) => o.v === key)!.k, run) : undefined}
      options={opts.map((o) => ({ key: o.v, icon: o.icon, label: o.label, ariaLabel: o.label }))}
    />
  )
}

// The kiosk member switcher: a calm face row bound to the device profile
// (lib/profile) — the same identity the mobile chip sets. "Maisonnée" (everyone) is
// the default neutral mode; tapping a face personalizes as that member; re-tapping
// it, or Maisonnée, returns to everyone. The face row itself is the shared
// MemberSwitcher (components/MemberSwitcher); this only wires the profile + maps the
// board's snake_case members to its normalized face shape.
// The board's « Aujourd'hui » face row: the shared MemberSwitcher bound to THIS
// device's profile, plus the one accent only this surface has (the waiting-mot dot).
//
// It was itself called `MemberSwitcher` until 2026-09-09, which forced this file to
// import the real primitive under an alias — so inside board/, `FaceSwitcher` meant
// the shared component and `MemberSwitcher` meant the four-line board wrapper, the
// exact reverse of everywhere else. One name, one component (devkitParity.test.ts).
export function TodayFaceRow({ members, t }: { members: Member[]; t: Dict }) {
  const { memberId, setMemberId } = useProfile()
  // A calm presence dot on a face that has « un mot t'attend » — boolean, never a count.
  const hasWaiting = useFaceHasWaiting()
  return (
    <MemberSwitcher
      // The waiting-mot dot is this surface's own accent, layered on the shared mapping.
      faces={facesFromMembers(members).map((f) => ({ ...f, dot: hasWaiting(f.id) }))}
      value={memberId}
      onChange={setMemberId}
      allLabel={t.profile.household}
      ariaLabel={t.profile.switch}
    />
  )
}
