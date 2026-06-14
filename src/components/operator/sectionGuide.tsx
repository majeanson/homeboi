import { GUIDE } from '../../lib/guideContent'
import { GuideCard } from './guide'

// The how-it-works for ONE Réglages tab, shown inline at the top of that tab —
// so each section now carries its own documentation instead of pointing off to
// the Guide. Looks up the single GUIDE entry whose `tab` matches; renders the
// same collapsible card the Guide uses, closed by default (reference, not the
// main act) and without the "go there" link (you're already here). Returns null
// for a tab with no documented card (e.g. the Guide tab itself).
export function SectionGuide({ tab }: { tab: string }) {
  const entry = GUIDE.find((e) => e.tab === tab)
  if (!entry) return null
  return (
    <div className="guide section-guide">
      <div className="guide__cards">
        <GuideCard entry={entry} showGoTo={false} />
      </div>
    </div>
  )
}
