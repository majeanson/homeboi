import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useHelp } from '../lib/help'

// A small "?" beside a section that deep-links into the Guide at the matching
// card (/settings?tab=guide&card=<id>, read by GuideSection). Shown only in
// tutorial mode and only to a parent — a toddler never sees it, and an expert
// household hides them all from Réglages ▸ Affichage. `card` is a GUIDE entry id
// (see lib/guideContent.ts). Render it right after a page/section title.
export function HelpDot({ card }: { card: string }) {
  const t = useT()
  const { tutorial } = useHelp()
  const { audience } = useAudience()
  if (!tutorial || audience === 'toddler') return null
  return (
    <Link
      to={`/settings?tab=guide&card=${card}`}
      className="help-dot"
      aria-label={t.help.learnMore}
      title={t.help.learnMore}
    >
      ?
    </Link>
  )
}
