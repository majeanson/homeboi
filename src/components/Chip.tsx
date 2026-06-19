import type { CSSProperties, ReactNode } from 'react'
import { InlineIcon, type IconName } from './Icon'

// The ONE chip — the small mono pill used for filters, toggles, day-pickers and
// tags across the app. Wraps the existing `.chip` / `.chip.is-on` look so the
// dozens of hand-rolled `<button className="chip">` collapse to one component.
//
// `onClick` makes it a toggle (aria-pressed reflects `selected`); omit it for a
// static label. `onRemove` adds a trailing ✕ (the removable tag-pill case).
export function Chip({
  children,
  selected,
  onClick,
  onRemove,
  removeLabel,
  icon,
  ariaLabel,
  title,
  disabled,
  className,
  style,
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  onRemove?: () => void
  removeLabel?: string
  icon?: IconName
  ariaLabel?: string
  title?: string
  disabled?: boolean
  /** Extra modifier class(es) appended after `chip`/`is-on` (e.g. `kitchen__pill`,
   *  `tag-admin__pill`) — for the chips that carry a layout/scope variant. */
  className?: string
  /** Inline style — the colour-tinted tag pills (`chipTint(...)`) need this. */
  style?: CSSProperties
}) {
  // A removable chip is itself the remove button (tap the pill to drop it) — the
  // pattern the recipe tag-pills use. Otherwise it's a toggle or a static label.
  const handler = onRemove ?? onClick
  const interactive = !!handler
  const cls = 'chip' + (selected ? ' is-on' : '') + (className ? ` ${className}` : '')

  if (!interactive) {
    return (
      <span className={cls} title={title} style={style}>
        {icon && <InlineIcon name={icon} />} {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={handler}
      aria-pressed={onClick && !onRemove ? !!selected : undefined}
      aria-label={ariaLabel ?? (onRemove ? removeLabel : undefined)}
      title={title}
      disabled={disabled}
    >
      {icon && <InlineIcon name={icon} />} {children}
      {onRemove && <InlineIcon name="x-bold" size={12} />}
    </button>
  )
}

// A labelled row of chips — the `.picker-chips` pattern (a quiet label then a
// wrapped run of chips). `label` is optional; omit it for a bare chip row.
export function ChipGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="chip-group">
      {label != null && <span className="chip-group__label mono">{label}</span>}
      <div className="chip-group__chips">{children}</div>
    </div>
  )
}
