import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useT } from '../i18n'
import { useHelp } from '../lib/help'
import { useAudience } from '../lib/audience'

// The section's identity glyph in the top-right of every themed tab's header.
// When tutorial help is on (and we're in the parent lens) the WHOLE disc is a
// quiet deep-link into the Guide at this section's card — folding the old "?"
// HelpDot into the icon itself, so one calm target both names the section and
// teaches it (a small "?" pip in the corner says "tap me to learn"). Outside
// tutorial mode (or in the toddler lens) it's a plain, non-interactive glyph.
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
      <span className="avatar__help" aria-hidden="true">
        ?
      </span>
    </Link>
  )
}
