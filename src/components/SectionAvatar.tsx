import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useT } from '../i18n'
import { useHelp } from '../lib/help'
import { useAudience } from '../lib/audience'

// The section's identity glyph in the top-right of every themed tab's header.
// When tutorial help is on (and we're in the parent lens) the WHOLE disc is a
// quiet deep-link into the Guide at this section's card — folding the old "?"
// HelpDot into the icon itself, so one calm target both names the section and
// teaches it. Outside tutorial mode (or in the toddler lens) it's a plain,
// non-interactive glyph.
//
// NO "?" pip: the header already carries the help-mode "?" button right beside
// this disc, and a second "?" badge stuck on the glyph read as two competing
// help affordances — and, overlapping the icon, as a rendering glitch (UX review
// 2026-07-14). One visible "?" per header; the disc stays a link (title +
// aria-label say so) without advertising itself with a rival mark.
export function SectionAvatar({
  icon,
  iconColor,
  background,
  card,
}: {
  icon: IconName
  iconColor: string
  background: string
  // A GUIDE entry id (see lib/guideContent.ts) — the card the disc links to.
  card: string
}) {
  const t = useT()
  const { tutorial } = useHelp()
  const { audience } = useAudience()
  const glyph = <Icon name={icon} size={26} color={iconColor} />
  if (!tutorial || audience === 'toddler')
    return (
      <div className="avatar" style={{ background }}>
        {glyph}
      </div>
    )
  return (
    <Link
      to={`/settings?tab=guide&card=${card}`}
      className="avatar avatar--help"
      style={{ background }}
      aria-label={t.help.learnMore}
      title={t.help.learnMore}
    >
      {glyph}
    </Link>
  )
}
