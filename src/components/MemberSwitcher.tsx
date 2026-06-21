import { Icon } from './Icon'

// The shared "pick-a-face" row — the calm Maisonnée + member faces control from the
// board's "Aujourd'hui" header (the kiosk member switcher), now generalized so any
// surface reuses the SAME look + behaviour. "Maisonnée" (everyone) is the neutral
// default first; tapping a face selects that member; with `toggleOff` (default) a
// re-tap of the active face returns to Maisonnée.
//
// CONTROLLED + identity-agnostic: callers pass a normalized `faces` list + `value`/
// `onChange`, so it works both for the device profile (board → `useProfile`) AND for
// a surface's own local pick (Le cercle's Notes "whose notes" face). Map your member
// shape (snake_case `lib/members` OR camelCase `lib/cercle`) to `MemberFace` at the
// call site — resolve the photo URL there (`imgUrl`) so this stays presentational.

export interface MemberFace {
  id: string
  name: string
  // The face's colour for the initial disc; null falls back to the neutral disc.
  colour: string | null
  // A resolved image URL (e.g. imgUrl(avatar_ref)) or null for the coloured initial.
  photoUrl?: string | null
}

export function MemberSwitcher({
  faces,
  value,
  onChange,
  allLabel,
  ariaLabel,
  toggleOff = true,
  className,
}: {
  faces: MemberFace[]
  // Selected member id, or null = Maisonnée (everyone).
  value: string | null
  onChange: (id: string | null) => void
  // Label for the neutral "everyone" option (e.g. t.profile.household).
  allLabel: string
  ariaLabel: string
  // Re-tapping the active face returns to Maisonnée (null). The board wants this;
  // pass false for a plain radio-style pick.
  toggleOff?: boolean
  className?: string
}) {
  return (
    <div className={'mswitch' + (className ? ' ' + className : '')} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={'mswitch__opt' + (value === null ? ' is-on' : '')}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        <span className="mswitch__av mswitch__av--all" aria-hidden="true">
          <Icon name="users-three-bold" size={18} />
        </span>
        <span className="mswitch__name">{allLabel}</span>
      </button>
      {faces.map((f) => {
        const on = f.id === value
        return (
          <button
            key={f.id}
            type="button"
            className={'mswitch__opt' + (on ? ' is-on' : '')}
            aria-pressed={on}
            onClick={() => onChange(on && toggleOff ? null : f.id)}
          >
            <span className="mswitch__av" style={{ background: f.photoUrl ? undefined : f.colour ?? undefined }}>
              {f.photoUrl ? <img src={f.photoUrl} alt="" /> : (f.name?.[0] ?? '?').toUpperCase()}
            </span>
            <span className="mswitch__name">{f.name}</span>
          </button>
        )
      })}
    </div>
  )
}
