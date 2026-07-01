import { InlineIcon, type IconName } from './Icon'

// THE calm on/off pill — filled (btn--primary) when on, plain when off, with a glyph +
// label and `aria-pressed` reflecting state. The shared version of the switch that was
// hand-rolled across Réglages ▸ Affichage (ambient + display); reuse it for any boolean
// setting that wants a labelled switch rather than a raw checkbox.
//
// The label + icon are the caller's job (they usually change with state, e.g.
// `icon={on ? 'sun-horizon-bold' : 'sun-bold'}`), so this stays a thin, presentational
// primitive. `disabled` also sets `aria-disabled` (a governed toggle, e.g. day/night
// while ambient auto-drives it). NOT for a cycle button (day↔night) — that isn't on/off.
export function Toggle({
  on,
  icon,
  label,
  onClick,
  disabled,
  iconColor,
  size = 16,
}: {
  on: boolean
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  iconColor?: string
  size?: number
}) {
  return (
    <button
      type="button"
      className={`btn${on ? ' btn--primary' : ''}`}
      aria-pressed={on}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClick}
    >
      <InlineIcon name={icon} size={size} color={iconColor} /> {label}
    </button>
  )
}
