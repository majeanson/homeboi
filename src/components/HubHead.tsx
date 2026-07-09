import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useAi } from '../lib/ai'
import { isGuest } from '../lib/device'
import { SectionAvatar } from './SectionAvatar'
import { Icon, type IconName } from './Icon'

// E-22 — lazy: the mic is a rare tap, not a boot-path need, and HubHead is part
// of the EAGER bundle (rendered by the eager Board page) — pulling AskSheet's
// voice/speech/Modal chain into that chunk would tax every boot for a feature
// most sessions never open (see check-bundle.mjs's eager-chunk budget).
const AskSheet = lazy(() => import('./AskSheet').then((m) => ({ default: m.AskSheet })))

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
  searchPick,
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
  // Help-mode wiring for the search magnifier (A-9 soft icon labels): pass the
  // tab's `(run) => help.pick('search', run)` and, while the « ? » is armed, a
  // tap EXPLAINS the loupe instead of leaving the page. Unarmed it navigates as
  // ever (pick passes the run through). Rendered as a <button> then, since the
  // tap may not navigate.
  searchPick?: (run: () => void) => () => void
}) {
  const t = useT()
  const { audience } = useAudience()
  const nav = useNavigate()
  const { enabled: aiEnabled } = useAi()
  const [askOpen, setAskOpen] = useState(false)
  // « Parle à la maison » — the ONE voice surface: ask a question (read) or file a
  // capture (write). A guest (read-only babysitter session) and the toddler lens
  // never see it (the same `audience === 'parent'` gate as the loupe below).
  //
  // It no longer hides when AI is off. It used to — the sheet only asked questions,
  // and an answer needs the model. But it now also carries « Classer », whose degraded
  // path (pick the type yourself) is precisely what you need WITHOUT AI. Hiding the
  // whole mic on `!aiEnabled` would take the capture spine offline with it; AskSheet
  // instead drops the « Demander » segment and opens straight on « Classer ».
  const showAsk = audience === 'parent' && !isGuest()
  return (
    <div className="app-head">
      <div className="app-head__main">
        <div className="app-head__titlerow">
          <h1 className="greet">{title}</h1>
        </div>
        {subtitle != null && <span className="app-head__date mono">{subtitle}</span>}
      </div>
      <div className="app-head__actions">
        {/* E-22 — « Parle à la maison » : hold the mic, ask a question over the
            household's own data or file what you just said. Beside the loupe, same
            corner every tab. */}
        {showAsk && (
          <button
            type="button"
            className="app-head__search app-head__ask"
            aria-label={t.ask.entry}
            title={t.ask.entry}
            onClick={() => setAskOpen(true)}
          >
            <Icon name="microphone-bold" size={20} />
          </button>
        )}
        {/* #30 — global search, reachable from every hub tab. Parent-only (a toddler
            has nothing to search for). */}
        {audience === 'parent' &&
          (searchPick ? (
            <button
              type="button"
              className="app-head__search"
              aria-label={t.search.title}
              title={t.search.title}
              onClick={searchPick(() => nav('/search'))}
            >
              <Icon name="magnifying-glass-bold" size={20} />
            </button>
          ) : (
            <Link to="/search" className="app-head__search" aria-label={t.search.title} title={t.search.title}>
              <Icon name="magnifying-glass-bold" size={20} />
            </Link>
          ))}
        {action}
        <SectionAvatar icon={icon} iconColor={iconColor} background={background} card={card} />
      </div>
      {/* Mounted ONLY while open — closing unmounts AskSheet, which kills a
          still-listening mic (see AskSheet's own header comment). */}
      {askOpen && (
        <Suspense fallback={null}>
          <AskSheet aiEnabled={aiEnabled} onClose={() => setAskOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
