import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { SectionAvatar } from './SectionAvatar'
import { Icon, type IconName } from './Icon'

// The shared header for the four themed hub tabs (Board/Kitchen/Routines/Liste):
// a big title on the left, the section's identity disc top-right. The disc is
// also the Guide deep-link in tutorial mode (see SectionAvatar). An optional
// `subtitle` sits as a quiet line under the title (the board uses it for today's
// date), and an optional `action` (e.g. the in-place help-mode "?" toggle) tucks
// into the top-right cluster beside the search + avatar, so a flat-list tab like
// La liste / Routines doesn't strand it on its own row. One component so the four
// headers can't drift apart.
export function HubHead({
  title,
  subtitle,
  icon,
  iconColor,
  background,
  card,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon: IconName
  iconColor: string
  background: string
  // A GUIDE entry id (lib/guideContent.ts) — the card the disc links to.
  card: string
  // Optional trailing control in the header cluster (sits before the identity
  // disc so the disc keeps its far-right corner anchor). E.g. a <HelpToggle/>.
  action?: ReactNode
}) {
  const t = useT()
  const { audience } = useAudience()
  return (
    <div className="app-head">
      <div className="app-head__main">
        <div className="app-head__titlerow">
          <h1 className="greet">{title}</h1>
        </div>
        {subtitle != null && <span className="app-head__date mono">{subtitle}</span>}
      </div>
      <div className="app-head__actions">
        {/* #30 — global search, reachable from every hub tab. Parent-only (a toddler
            has nothing to search for). */}
        {audience === 'parent' && (
          <Link to="/search" className="app-head__search" aria-label={t.search.title} title={t.search.title}>
            <Icon name="magnifying-glass-bold" size={20} />
          </Link>
        )}
        {action}
        <SectionAvatar icon={icon} iconColor={iconColor} background={background} card={card} />
      </div>
    </div>
  )
}
