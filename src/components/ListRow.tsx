import type { ReactNode } from 'react'

// A general list-row shell: an optional leading slot (icon/avatar/picture), a
// title with optional subtitle, and an optional trailing actions slot. The plain
// cousin of the domain rows (Act = board activity card, CheckRow = checklist row,
// `.list-row` = the swipe-to-delete shopping row) — for the many one-off operator/
// kitchen rows that are just "thing + maybe a sub-line + maybe ✏️/🗑️".
//
// `onActivate` turns the whole row into a nav button (a caret-free tap target);
// omit it for a static row whose actions live in `actions`.
export function ListRow({
  leading,
  title,
  subtitle,
  actions,
  onActivate,
  activateLabel,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  onActivate?: () => void
  activateLabel?: string
  className?: string
}) {
  const body = (
    <>
      {leading && <span className="listrow__lead">{leading}</span>}
      <span className="listrow__text">
        <span className="listrow__title">{title}</span>
        {subtitle != null && <span className="listrow__sub mono">{subtitle}</span>}
      </span>
    </>
  )
  const cls = 'listrow' + (className ? ` ${className}` : '')

  // A nav row is one big button; a static row keeps its actions tappable beside an
  // inert body (so a glance/scroll on a wall tablet can't fire anything).
  if (onActivate) {
    return (
      <button type="button" className={cls + ' listrow--nav'} onClick={onActivate} aria-label={activateLabel}>
        {body}
      </button>
    )
  }
  return (
    <div className={cls}>
      {body}
      {actions && <span className="listrow__actions">{actions}</span>}
    </div>
  )
}
