import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useHelp } from '../lib/help'
import { useAudience } from '../lib/audience'
import { Icon } from './Icon'

// The ONE "nothing here, and that's fine" line. Empty states were scattered across
// ~7 class names (feed-empty, board__empty, *-empty…); this is the calm default —
// a quiet, balanced line, never a stray dash or an alarm. `tone='calm'` adds a
// touch more breathing room for the deliberate "nothing planned tonight" case.
// role='status' so a screen reader announces it when a list empties.
//
// Optional `guide` adds a small "→ Voir le guide" deep-link under the line (#8),
// for the "what do I even do here?" empties a first-time household lands on — the
// same /settings?tab=guide&card=… target HelpDot/HelpBubble use. Opt-in on purpose:
// a link on every trivial empty would be noise, not calm. Gated exactly like the
// HelpDot "?": tutorial mode only, never the toddler lens — an expert household
// (help off) sees the empty line with no guide link.
export function EmptyState({
  children,
  tone = 'plain',
  className,
  guide,
}: {
  children: ReactNode
  tone?: 'plain' | 'calm'
  className?: string
  guide?: { card: string; point?: number }
}) {
  const t = useT()
  const { tutorial } = useHelp()
  const { audience } = useAudience()
  const to =
    guide && tutorial && audience !== 'toddler'
      ? `/settings?tab=guide&card=${guide.card}${guide.point != null ? `&point=${guide.point}` : ''}`
      : null
  return (
    <p
      className={'empty-state' + (tone === 'calm' ? ' empty-state--calm' : '') + (className ? ` ${className}` : '')}
      role="status"
    >
      {children}
      {to && (
        <Link className="empty-state__guide" to={to}>
          {t.help.goToGuide} <Icon name="arrow-right-bold" size={12} />
        </Link>
      )}
    </p>
  )
}
