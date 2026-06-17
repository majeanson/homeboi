import type { ReactNode } from 'react'
import { SectionAvatar } from './SectionAvatar'
import type { IconName } from './Icon'

// The shared header for the four themed hub tabs (Board/Kitchen/Routines/Liste):
// a big title on the left, the section's identity disc top-right. The disc is
// also the Guide deep-link in tutorial mode (see SectionAvatar) — there is no
// separate "?" any more. An optional `subtitle` sits as a quiet line under the
// title (the board uses it for today's date). One component so the four headers
// can't drift apart.
export function HubHead({
  title,
  subtitle,
  icon,
  iconColor,
  background,
  card,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon: IconName
  iconColor: string
  background: string
  // A GUIDE entry id (lib/guideContent.ts) — the card the disc links to.
  card: string
}) {
  return (
    <div className="app-head">
      <div>
        <div className="app-head__titlerow">
          <h1 className="greet">{title}</h1>
        </div>
        {subtitle != null && <span className="app-head__date mono">{subtitle}</span>}
      </div>
      <SectionAvatar icon={icon} iconColor={iconColor} background={background} card={card} />
    </div>
  )
}
