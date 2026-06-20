import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT, useLang } from '../i18n'
import { useAudience } from '../lib/audience'
import { useHelp } from '../lib/help'
import { useTour } from '../lib/tour'
import { TOURS } from '../lib/tourContent'
import { GUIDE } from '../lib/guideContent'
import { renderRich } from '../lib/richText'
import { Icon } from './Icon'

// A calm, once-per-section welcome card shown the FIRST time a parent opens a
// themed tab — the progressive, in-context half of onboarding (the guided tour
// covers the cross-cutting basics; this explains "what this section is" right
// where they land). Reuses the very same content the Guide tab shows (the
// matching GUIDE entry's one-line `what` + its first few point labels) so the
// two never drift, and links into the full card for the deep version.
//
// Deliberately NOT a coachmark/spotlight: it never blocks pointer input, it sits
// inline above the section, and it's dismissible (NFR-CALM — no nagging). Gated
// exactly like the HelpDot "?": tutorial mode only, never the toddler lens. It
// also stays hidden while a tour is running, so the first-login essentials tour
// and this card never pile up on the board at once.

// One key holds the SET of dismissed section ids (JSON array), mirroring the
// tour's `babillard-tours-seen` shape so each section tracks independently
// without a new key per section. Guarded so storage quirks never break a page.
const SEEN_KEY = 'babillard-sections-seen'

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function hasIntroSeen(id: string): boolean {
  return readSeen().includes(id)
}
function markIntroSeen(id: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(id)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]))
  } catch {
    /* noop */
  }
}

export function SectionIntro({ card }: { card: string }) {
  const t = useT()
  const { lang } = useLang()
  const { tutorial } = useHelp()
  const { audience } = useAudience()
  const { isActive, start } = useTour()
  const [seen, setSeen] = useState(() => hasIntroSeen(card))
  // #32 — this section has its own short guided tour when a Tour shares its id.
  const hasTour = TOURS.some((tr) => tr.id === card)

  if (!tutorial || audience === 'toddler' || isActive || seen) return null
  const entry = GUIDE.find((e) => e.id === card)
  if (!entry) return null

  const dismiss = () => {
    markIntroSeen(card)
    setSeen(true)
  }

  return (
    <aside className="section-intro" aria-label={entry.title[lang]}>
      <div className="section-intro__head">
        <span className="section-intro__icon">
          <Icon name={entry.icon} size={22} />
        </span>
        <span className="section-intro__title">{entry.title[lang]}</span>
        <button type="button" className="section-intro__dismiss" onClick={dismiss}>
          <Icon name="x-bold" size={14} />
          <span>{t.help.gotIt}</span>
        </button>
      </div>
      <p className="section-intro__what">{renderRich(entry.what[lang])}</p>
      {/* The first few point labels — the "what you can do here" headlines, no
          detail. The full card (deep-linked below) carries the rest. */}
      <ul className="section-intro__points">
        {entry.points.slice(0, 3).map((p, i) => (
          <li key={i}>{renderRich(p.label[lang])}</li>
        ))}
      </ul>
      <div className="section-intro__actions">
        {/* #32 — start this section's short spotlight tour (dismisses the intro). */}
        {hasTour && (
          <button
            type="button"
            className="section-intro__tour"
            onClick={() => {
              markIntroSeen(card)
              setSeen(true)
              start(card)
            }}
          >
            <Icon name="sparkle-bold" size={16} />
            <span>{t.help.takeTour}</span>
          </button>
        )}
        <Link className="section-intro__more" to={`/settings?tab=guide&card=${card}`}>
          <span>{t.help.learnMore}</span>
          <Icon name="arrow-right-bold" size={16} />
        </Link>
      </div>
    </aside>
  )
}
