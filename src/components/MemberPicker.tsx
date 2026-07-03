import { type MemberFace } from './MemberSwitcher'

// The MULTI-select sibling of MemberSwitcher: tap household faces to select several
// at once — a chore rotation, an event's passengers, a pet's owners, a routine's kids.
// Same calm `.mswitch` face-row look as the single-select switcher, minus the neutral
// "Maisonnée / everyone" option (a multi-pick is an explicit set of members, not the
// whole household). Pass `ordinals` to show a 1-based selection-order badge — the
// rotation turn order ("1." takes the first turn).
//
// CONTROLLED + presentational (like MemberSwitcher): map your member shape (snake_case
// `lib/members` OR camelCase `lib/cercle`) to `MemberFace` at the call site and resolve
// the photo URL there (`imgUrl`). `values` is the selected id list IN SELECTION ORDER,
// so the ordinal badges read as the order the operator tapped them.
export function MemberPicker({
  faces,
  values,
  onToggle,
  ariaLabel,
  ordinals = false,
  className,
}: {
  faces: MemberFace[]
  // Selected member ids, in selection order (drives the ordinal badges).
  values: string[]
  onToggle: (id: string) => void
  ariaLabel: string
  // Show a 1-based selection-order badge on each selected face (chore rotation).
  ordinals?: boolean
  className?: string
}) {
  return (
    <div
      className={'mswitch mswitch--multi' + (className ? ' ' + className : '')}
      role="group"
      aria-label={ariaLabel}
    >
      {faces.map((f) => {
        const idx = values.indexOf(f.id)
        const on = idx >= 0
        return (
          <button
            key={f.id}
            type="button"
            className={'mswitch__opt' + (on ? ' is-on' : '')}
            aria-pressed={on}
            onClick={() => onToggle(f.id)}
          >
            <span
              className="mswitch__av"
              style={{ background: f.photoUrl ? undefined : f.colour ?? undefined }}
            >
              {f.photoUrl ? <img src={f.photoUrl} alt="" /> : (f.name?.[0] ?? '?').toUpperCase()}
            </span>
            {ordinals && on && (
              <span className="mswitch__ord" aria-hidden="true">
                {idx + 1}
              </span>
            )}
            <span className="mswitch__name">{f.name}</span>
          </button>
        )
      })}
    </div>
  )
}
