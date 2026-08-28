import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useHelp } from '../lib/help'
import { useAudience } from '../lib/audience'
import { isGuest } from '../lib/device'
import { InlineIcon, type IconName } from './Icon'

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
// `action` is the DOOR (bmad/12 #6). An empty section that explains itself and then
// offers no way forward is a dead end, and the ＋ FAB — the actual way in — is a
// glyph the words never mention. This renders one quiet chip-link under the line:
// « Ajouter une recette », « Ouvrir les Réglages », « Essayer ».
//
// WHERE IT BELONGS, and this is a real limit rather than a shortcut: a SECTION-level
// empty ("you have no recipes") is a dead end and takes a door. A CELL-level empty
// (a month-grid day, an unplanned meal slot, one quiet row) is NOT — « Rien de prévu »
// is the correct and complete answer there, and padding it with a call to action
// turns a calm surface into a nag. That contract is written in COMPONENTS.md and it
// is why this is opt-in like `guide`, not automatic. Of ~108 call sites, most are
// cells and stay bare on purpose.
//
// Use the app's own URL grammar for the target (DISCOVERY.md): `?plus=` opens the ＋
// sheet on a tile, `?tab=&sub=&focus=` lands on a settings card — so the door names
// the thing the FAB would have done.
export function EmptyState({
  children,
  tone = 'plain',
  className,
  guide,
  action,
}: {
  children: ReactNode
  tone?: 'plain' | 'calm'
  className?: string
  guide?: { card: string; point?: number }
  action?: { to: string; label: string; icon?: IconName }
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
          {/* InlineIcon, not Icon: Icon hard-codes `display:block` as an INLINE style
              (it beats any stylesheet), so the arrow formed its own block box and
              landed on a line of its own under « Voir le guide » on every empty tab
              (first-run pass, 2026-07-14). InlineIcon is exactly this case. */}
          {t.help.goToGuide} <InlineIcon name="arrow-right-bold" size={12} />
        </Link>
      )}
      {/* The door. Ungated — unlike `guide`, this is not an explanation a household
          can outgrow: a section with nothing in it needs its way in whether or not
          tutorial hints are on. Hidden only from a read-only guest, who has nothing
          to add (the same isGuest() rule every other write affordance follows). */}
      {action && !isGuest() && (
        <Link className="empty-state__action" to={action.to}>
          {action.icon && <InlineIcon name={action.icon} size={13} />} {action.label}
        </Link>
      )}
    </p>
  )
}
