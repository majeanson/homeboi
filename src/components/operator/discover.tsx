import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useSampleStatus } from '../../lib/sample'
import { useTour } from '../../lib/tour'
import { GUIDE, SECTION_TINT, cardHomeTab, type SectionKey } from '../../lib/guideContent'
import { DISCOVERY_PROBES, buildDiscoveryTour, dayIndexNow, pickDaily } from '../../lib/discovery'
import { WHATS_NEW } from '../../lib/whatsNew'
import { renderRich } from '../../lib/richText'
import { Icon } from '../Icon'

// Découvrir's two calm discovery cards (bmad/08 B-11 + B-14), both rendered with
// the SectionIntro look (.section-intro — same head/dismiss/actions family, no
// new CSS): « Quoi de neuf » (one line from the hand-maintained lib/whatsNew
// list) and « Le saviez-vous ? » (ONE feature this household provably never
// touched, from the lib/discovery data-absence probes). Dismissals are per-device
// and forever — the same array-in-one-key localStorage shape as SectionIntro /
// the tour's seen record.

const WHATSNEW_KEY = 'babillard-whatsnew-seen'
const DIDYOUKNOW_KEY = 'babillard-didyouknow-seen'

function readSeen(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function markSeen(key: string, id: string): void {
  try {
    const seen = readSeen(key)
    if (!seen.includes(id)) localStorage.setItem(key, JSON.stringify([...seen, id]))
  } catch {
    /* noop */
  }
}

// The section tint a guide card wears (mirrors guide.tsx sectionTintFor, kept
// local to avoid a guide→discover→guide import loop).
const tintFor = (cardId: string): string | undefined => {
  const home = cardHomeTab(cardId)
  return home in SECTION_TINT ? SECTION_TINT[home as SectionKey].ink : undefined
}

// « Quoi de neuf » — the newest WHATS_NEW entry this device hasn't dismissed,
// as ONE line. Dismissing reveals the next-newest on the next visit (if any),
// so a returning household catches up one calm line at a time, never a feed.
export function WhatsNewLine() {
  const t = useT()
  const { lang } = useLang()
  const [seen, setSeen] = useState<string[]>(() => readSeen(WHATSNEW_KEY))
  const entry = WHATS_NEW.find((w) => !seen.includes(w.id))
  if (!entry) return null
  const dismiss = () => {
    markSeen(WHATSNEW_KEY, entry.id)
    setSeen(readSeen(WHATSNEW_KEY))
  }
  return (
    <aside className="section-intro" aria-label={t.discover.whatsNew}>
      <div className="section-intro__head">
        <span className="section-intro__icon">
          <Icon name="sparkle-bold" size={22} />
        </span>
        <span className="section-intro__title">{t.discover.whatsNew}</span>
        <button type="button" className="section-intro__dismiss" onClick={dismiss}>
          <Icon name="x-bold" size={14} />
          <span>{t.help.gotIt}</span>
        </button>
      </div>
      <p className="section-intro__what">{renderRich(entry.text[lang])}</p>
      {entry.card && (
        <div className="section-intro__actions">
          <Link className="section-intro__more" to={`/settings?tab=guide&card=${entry.card}`}>
            <span>{t.help.learnMore}</span>
            <Icon name="arrow-right-bold" size={16} />
          </Link>
        </div>
      )}
    </aside>
  )
}

// « Le saviez-vous ? » — ONE dismissible card for a feature the household
// provably hasn't touched. Operator-only reads; hidden while the demo family is
// still loaded (sample rows would make every feature read as "used") and until
// EVERY probe answered (a failed read must never advertise on a hunch). When
// several features sleep, a « Faire le tour » assembles them into the adaptive
// discovery tour (A-5 safe core).
export function DidYouKnowCard() {
  const t = useT()
  const { lang } = useLang()
  const { signedIn } = useAuth()
  const { hasSample, pending } = useSampleStatus()
  const { startTour } = useTour()
  const [seen, setSeen] = useState<string[]>(() => readSeen(DIDYOUKNOW_KEY))
  const enabled = signedIn && !pending && !hasSample
  const results = useQueries({
    queries: DISCOVERY_PROBES.map((p) => ({
      queryKey: p.key as string[],
      queryFn: () => api<unknown>(p.path),
      enabled,
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  })
  if (!enabled) return null
  if (!results.every((r) => r.isSuccess)) return null
  const unused = DISCOVERY_PROBES.filter((p, i) => p.unused(results[i].data)).map((p) => p.card)
  const candidates = unused.filter((id) => !seen.includes(id))
  const pick = pickDaily(candidates, dayIndexNow())
  const entry = pick ? GUIDE.find((e) => e.id === pick) : null
  if (!pick || !entry) return null
  const tint = tintFor(entry.id)
  const tour = candidates.length >= 2 ? buildDiscoveryTour(candidates) : null
  const dismiss = () => {
    markSeen(DIDYOUKNOW_KEY, pick)
    setSeen(readSeen(DIDYOUKNOW_KEY))
  }
  return (
    <aside
      className="section-intro"
      aria-label={t.discover.didYouKnow}
      style={tint ? ({ '--accent': tint } as CSSProperties) : undefined}
    >
      <div className="section-intro__head">
        <span className="section-intro__icon">
          <Icon name={entry.icon} size={22} />
        </span>
        <span className="section-intro__title">
          {t.discover.didYouKnow} {entry.title[lang]}
        </span>
        <button type="button" className="section-intro__dismiss" onClick={dismiss}>
          <Icon name="x-bold" size={14} />
          <span>{t.help.gotIt}</span>
        </button>
      </div>
      <p className="section-intro__what">{renderRich(entry.what[lang])}</p>
      <div className="section-intro__actions">
        {tour && (
          <button type="button" className="section-intro__tour" onClick={() => startTour(tour)}>
            <Icon name="sparkle-bold" size={16} />
            <span>{t.discover.tourStart(candidates.length)}</span>
          </button>
        )}
        <Link className="section-intro__more" to={`/settings?tab=guide&card=${entry.id}`}>
          <span>{t.help.learnMore}</span>
          <Icon name="arrow-right-bold" size={16} />
        </Link>
      </div>
    </aside>
  )
}
