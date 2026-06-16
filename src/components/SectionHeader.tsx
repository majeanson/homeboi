import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

// A small section header: an optional emoji/icon, a title, an optional subtitle,
// and an optional trailing action (a "＋ Ajouter", a filter). Unifies the kitchen
// / kid / reserve header variants into one anatomy. Presentational — pass an
// already-translated title.
export function SectionHeader({
  title,
  subtitle,
  emoji,
  icon,
  iconColor,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  emoji?: string
  icon?: IconName
  iconColor?: string
  action?: ReactNode
}) {
  return (
    <div className="section-header">
      <div className="section-header__main">
        {emoji && (
          <span className="section-header__emoji" aria-hidden="true">
            {emoji}
          </span>
        )}
        {icon && <Icon name={icon} size={18} color={iconColor} />}
        <span className="section-header__text">
          <span className="section-header__title">{title}</span>
          {subtitle != null && <span className="section-header__sub mono">{subtitle}</span>}
        </span>
      </div>
      {action && <div className="section-header__action">{action}</div>}
    </div>
  )
}
