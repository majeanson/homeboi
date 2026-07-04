import { GUIDE, SECTION_TINT } from '../../lib/guideContent'
import { GuideCard } from './guide'

// The how-it-works for ONE Réglages tab, shown inline at the top of that tab —
// so each section now carries its own documentation instead of pointing off to
// the Guide. Looks up the ONE consolidated `settings`-group card whose `tab`
// matches (each Réglages tab now has exactly one such card), and renders the same
// collapsible card the Guide uses, closed by default (reference, not the main act)
// and without the "go there" link (you're already here). We scope to the settings
// group on purpose: a few CONCEPT cards (todos, home-projects, auto) also carry a
// `tab` for their Guide "go there" link, and a bare find-by-tab would let one of
// those shadow the real settings card. Returns null for a tab with no settings card
// (e.g. the Guide tab itself).
export function SectionGuide({ tab }: { tab: string }) {
  const entry = GUIDE.find((e) => e.group === 'settings' && e.tab === tab)
  if (!entry) return null
  return (
    <div className="guide section-guide">
      <div className="guide__cards">
        <GuideCard entry={entry} showGoTo={false} tint={SECTION_TINT.settings.ink} />
      </div>
    </div>
  )
}
