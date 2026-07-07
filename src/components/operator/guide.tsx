import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { GUIDE, type GuideEntry, CONCEPT_THEMES, SECTION_TINT, cardHomeTab, type SectionKey } from '../../lib/guideContent'
import { renderRich, stripTokens, highlight as highlightText } from '../../lib/richText'
import { fold } from '../../lib/normalize'
import { useTour } from '../../lib/tour'
import { resetWelcome } from '../WelcomeCard'
import { OperatorSection } from './OperatorSection'
import { FeatureMap } from '../FeatureMap'
import { SampleDataControls } from './sampleData'
import { Icon } from '../Icon'
import { EmptyState } from '../EmptyState'

// One documentation card (native <details>, so it stays accessible and calm):
// an icon, a title, the one-line "what", then every point as its own nested
// collapsible. Presentational — the Guide tab (below) drives search/deep-link
// state. (`showGoTo` can be turned off to render a card without its "go there"
// link when it already sits on the surface it would point to.)
function GuideCard({
  entry,
  open,
  isTarget,
  cardRef,
  pointsOpen = false,
  showGoTo = true,
  targetPoint,
  highlight: hl,
  tint,
  onReplayTour,
  onResetOnboarding,
}: {
  entry: GuideEntry
  open?: boolean
  isTarget?: boolean
  cardRef?: Ref<HTMLDetailsElement>
  // The section colour (SECTION_TINT ink) this card belongs to. Applied as a local
  // `--accent` override so the card's icon, chevron, target-ring and "go there"
  // link all adopt the section's hue — they already read `var(--accent, …)`. Undefined
  // (start cards, inline section guides) keeps the default marigold accent.
  tint?: string
  pointsOpen?: boolean
  showGoTo?: boolean
  // The active search words — every fold-match in the title/what/points gets a
  // calm <mark> so the reader sees WHY this card surfaced (lib/richText highlight).
  highlight?: string
  // A specific sub-point to open + highlight + scroll to (contextual "?" deep-link).
  targetPoint?: number
  // Replay a guided tour by id (the card names it via entry.tour). Generalized so
  // EVERY tour — the essentials one AND each section tour — is re-doable here, not
  // just on first run.
  onReplayTour?: (tourId: string) => void
  // Re-show the Board first-run WelcomeCard checklist (the "Première fois" card).
  onResetOnboarding?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const pointRef = useRef<HTMLDetailsElement | null>(null)
  // Scroll the targeted point into view once (after the card has opened). Runs after
  // the card-level scroll in GuideSection, so the point wins the final position.
  useEffect(() => {
    if (targetPoint != null && pointRef.current) {
      pointRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [targetPoint])
  return (
    <details
      ref={cardRef}
      className={`guide__card${isTarget ? ' is-target' : ''}`}
      open={open}
      style={tint ? ({ '--accent': tint } as CSSProperties) : undefined}
    >
      <summary className="guide__summary">
        <span className="guide__icon">
          <Icon name={entry.icon} size={26} />
        </span>
        <span className="guide__heads">
          <span className="guide__title">{hl ? highlightText(entry.title[lang], hl) : entry.title[lang]}</span>
          <span className="guide__what">{renderRich(entry.what[lang], hl)}</span>
        </span>
        {/* A visible expand/collapse chevron — the affordance is shown, not
            spelled out in prose. Rotates with the card's open state (CSS). */}
        <span className="guide__chevron" aria-hidden="true">
          <Icon name="caret-down-bold" size={18} />
        </span>
      </summary>
      <div className="guide__points">
        {entry.points.map((p, i) => {
          // A contextual "?" can deep-link to ONE point: open + highlight + scroll it.
          const isPt = i === targetPoint
          return (
            // Each explanation collapses under its own clickable title;
            // a search hit (or a point deep-link) opens them so the text is visible.
            <details
              key={i}
              ref={isPt ? pointRef : undefined}
              className={`guide__point${isPt ? ' is-target' : ''}`}
              open={pointsOpen || isPt}
            >
              <summary className="guide__point-title">{renderRich(p.label[lang], hl)}</summary>
              <p className="guide__point-detail">{renderRich(p.detail[lang], hl)}</p>
              {/* The WHY, when the point earns one: a distinct, softer line so a
                  parent scans WHAT first, WHY second. */}
              {p.why && <p className="guide__point-why">{renderRich(p.why[lang], hl)}</p>}
            </details>
          )
        })}
        {/* A direct "go there" link into the LIVE feature. `route` (any hub tab or
            scene, e.g. /board, /voyage/new, /drawings) wins; else a Settings-tab
            card falls back to /settings?tab=<id>. Off when the card is shown inline
            on the tab it documents. So a concept card now opens the real feature,
            not just its explanation — the Guide became a launcher too. */}
        {showGoTo && (entry.route || entry.tab) && (
          <Link className="guide__goto" to={entry.route ?? `/settings?tab=${entry.tab}`}>
            <span>{t.operator.guideGoTo}</span>
            <Icon name="arrow-right-bold" size={18} />
          </Link>
        )}
        {/* Any card naming a tour hosts a replay button: it (re)starts that tour,
            which navigates to its own start route. The essentials tour reads
            "replay the guided tour"; a section tour reads "redo this section's tour". */}
        {entry.tour && onReplayTour && (
          <button type="button" className="guide__goto" onClick={() => onReplayTour(entry.tour!)}>
            <Icon name="repeat-bold" size={18} />
            <span>{entry.tour === 'essentials' ? t.operator.replayTour : t.operator.replaySectionTour}</span>
          </button>
        )}
        {/* Re-show the Board first-run welcome checklist (it's dismiss-once). */}
        {entry.resetOnboarding && onResetOnboarding && (
          <button type="button" className="guide__goto" onClick={onResetOnboarding}>
            <Icon name="sparkle-bold" size={18} />
            <span>{t.operator.resetOnboarding}</span>
          </button>
        )}
      </div>
    </details>
  )
}

// The section colour (SECTION_TINT ink) a card should wear, so every card in the
// Guide reads in the hue of the section it documents — "proper mapping", one
// source (SECTION_TINT, itself mirroring the nav). A section card's id IS a
// SectionKey (board/kitchen/…); a concept card inherits its bucket's section; a
// set-* card wears the themed tab it homes on (cardHomeTab). Start (overview)
// cards keep the default accent.
const sectionTintFor = (e: GuideEntry): string | undefined => {
  if (e.group === 'start') return undefined
  const home = cardHomeTab(e.id)
  return home in SECTION_TINT ? SECTION_TINT[home as SectionKey].ink : undefined
}

// The Réglages restructure folded 15 thin settings cards into 8 consolidated ones,
// but the contextual "?" deep-links in operatorHelp.ts / addHelp.ts still point at the
// OLD card ids + point indices. This map redirects an old id to the card it merged
// into, and shifts the point by the block's base offset, so every "→ Voir le guide"
// still lands on the exact card AND sub-point. (Surviving cards kept their original
// points at their original indices; merged points were appended after them.)
const SETTINGS_CARD_ALIAS: Record<string, { id: string; base: number }> = {
  'set-guest': { id: 'set-devices', base: 2 },
  'set-routines': { id: 'set-chores', base: 4 },
  'set-meals': { id: 'set-recipes', base: 3 },
  'set-ghost': { id: 'set-shopping', base: 4 },
  'set-photos': { id: 'set-display', base: 8 },
  'set-calm': { id: 'set-display', base: 11 },
  'set-recap': { id: 'set-ai', base: 0 },
  'set-ailog': { id: 'set-ai', base: 4 },
}
const parseGuidePoint = (p: string | null) => (p != null && p !== '' ? Number(p) : null)
// Resolve a (?card, ?point) deep-link through the alias map above. Exported for
// pages/Operator, which homes a ?card= deep-link onto the themed tab that hosts
// the card (cardHomeTab) before this panel consumes it.
export const resolveGuideCard = (card: string | null, point: number | null): { id: string | null; point: number | null } => {
  if (!card) return { id: null, point }
  const alias = SETTINGS_CARD_ALIAS[card]
  if (alias) return { id: alias.id, point: alias.base + (point ?? 0) }
  return { id: card, point }
}

// The (?card, ?point) deep-link wiring shared by ComprendrePanel and Découvrir:
// resolve the target card through SETTINGS_CARD_ALIAS, mirror it into local state,
// CONSUME the params (replace) so a refresh/back doesn't re-force it, then open
// every <details> ancestor and scroll the card into view. `pinTab` (a themed tab
// id) is written into the URL alongside the consumption: Operator only *derives*
// the forced tab/lens while ?card= is present, so without the pin the view would
// snap back to the raw ?tab= the moment the param is consumed.
function useGuideCardTarget(pinTab?: string) {
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(
    () => resolveGuideCard(params.get('card'), parseGuidePoint(params.get('point'))).id,
  )
  const [targetPoint, setTargetPoint] = useState<number | null>(
    () => resolveGuideCard(params.get('card'), parseGuidePoint(params.get('point'))).point,
  )
  const targetRef = useRef<HTMLDetailsElement | null>(null)
  useEffect(() => {
    const card = params.get('card')
    if (!card) return
    const resolved = resolveGuideCard(card, parseGuidePoint(params.get('point')))
    setOpenId(resolved.id)
    setTargetPoint(resolved.point)
    const next = new URLSearchParams(params)
    next.delete('card')
    next.delete('point')
    if (pinTab) {
      next.set('tab', pinTab)
      next.set('lens', 'comprendre')
    }
    setParams(next, { replace: true })
  }, [params, setParams, pinTab])
  useEffect(() => {
    if (openId && targetRef.current) {
      // A deep-linked card may sit inside collapsed <details>; open every ancestor
      // before scrolling, or the target would be display:none and the scroll would
      // land on empty space.
      let node: HTMLElement | null = targetRef.current
      while (node) {
        if (node instanceof HTMLDetailsElement) node.open = true
        node = node.parentElement
      }
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [openId])
  return { openId, targetPoint, targetRef }
}

// The « Comprendre » lens of one themed Réglages tab: everything the Guide knows
// about that section, in the section's colour — the section's lead card (open on
// arrival, hosts the section-tour replay), its "the Réglages reference" set-*
// card(s), then the concept cards of its CONCEPT_THEMES bucket. This is where the
// old collapsed « Les réglages, onglet par onglet » group lives now: on the tab
// itself, not buried in a table of contents. Card ids + point indices are
// untouched, so every HelpBubble/addHelp/operatorHelp deep-link keeps landing on
// the exact card and sub-point (Operator homes ?card= onto this tab first).
export function ComprendrePanel({ section }: { section: SectionKey }) {
  const t = useT()
  const { start } = useTour()
  const nav = useNavigate()
  const resetOnboarding = () => {
    resetWelcome()
    nav('/board')
  }
  const { openId, targetPoint, targetRef } = useGuideCardTarget(section)
  const tint = SECTION_TINT[section].ink
  const bucket = CONCEPT_THEMES.find((th) => th.key === section)
  const lead = GUIDE.filter((e) => e.group === 'sections' && e.id === section)
  const setCards = GUIDE.filter((e) => e.group === 'settings' && cardHomeTab(e.id) === section)
  const concepts = bucket
    ? GUIDE.filter((e) => e.group === 'concepts' && bucket.ids.includes(e.id)).sort(
        (a, b) => bucket.ids.indexOf(a.id) - bucket.ids.indexOf(b.id),
      )
    : []
  const renderCard = (e: GuideEntry, alwaysOpen = false) => (
    <GuideCard
      key={e.id}
      entry={e}
      cardRef={e.id === openId ? targetRef : undefined}
      isTarget={e.id === openId}
      targetPoint={e.id === openId ? targetPoint ?? undefined : undefined}
      open={alwaysOpen || e.id === openId}
      tint={tint}
      onReplayTour={start}
      onResetOnboarding={resetOnboarding}
    />
  )
  return (
    <OperatorSection title={t.operator.lensLearn} className="guide">
      <div className="guide__cards">
        {/* The section's own card leads, open — "what this section is" before any
            knob. The set-* card and the concepts stay collapsed (calm). */}
        {lead.map((e) => renderCard(e, true))}
        {setCards.map((e) => renderCard(e))}
        {concepts.map((e) => renderCard(e))}
      </div>
    </OperatorSection>
  )
}

// Réglages ▸ Découvrir — the global entry: a search box over the WHOLE manual, the
// colored feature-map jump-grid (opens each themed tab's Comprendre lens), the
// « Première fois » overview card (tour replay + re-show the welcome checklist),
// and the sample-data controls. Each themed tab now hosts its own slice of the
// manual (ComprendrePanel); this tab is where you look when you don't yet know
// which theme you need. Search matches across titles, the one-line "what", and
// every point (label + detail + why) in the current language — accent-insensitive
// (fold), ranked so a TITLE hit lands first, with every match <mark>ed.
// Content lives in lib/guideContent.ts; this is the view.
export function DiscoverSection() {
  const t = useT()
  const { lang } = useLang()
  const { start } = useTour()
  const nav = useNavigate()
  // Re-show the first-run welcome checklist: clear its record, then land on the
  // board where it remounts and reads the cleared state.
  const resetOnboarding = () => {
    resetWelcome()
    nav('/board')
  }
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()

  // ?card= deep-links whose card homes on Découvrir (the start card) — plus the
  // search-result cards rendered here — reuse the shared open/scroll wiring. No
  // pin: the raw ?tab= already resolves to this tab.
  const { openId, targetPoint, targetRef } = useGuideCardTarget()

  // A feature-map tile opens that theme's Réglages tab on its Comprendre lens
  // (one URL write — two useTabParam setters in a row would race each other).
  const openTheme = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    next.set('lens', 'comprendre')
    setParams(next, { replace: true })
  }

  const q = query.trim()
  const needle = fold(q)
  // Ranked search (accent-insensitive via fold, so "reglages" finds « Réglages »):
  // a hit on the card TITLE outranks one on the one-line "what", which outranks a
  // point title, which outranks the point prose (detail + why). While searching,
  // the results render as ONE flat list in that order — the card you named comes
  // first, not wherever the taxonomy happens to place it. Stable sort, so ties
  // keep the manual's own order.
  const ranked = useMemo(() => {
    if (!needle) return null
    const has = (s: string) => fold(stripTokens(s)).includes(needle)
    const hits: { e: GuideEntry; rank: number }[] = []
    for (const e of GUIDE) {
      const rank = has(e.title[lang])
        ? 0
        : has(e.what[lang])
          ? 1
          : e.points.some((p) => has(p.label[lang]))
            ? 2
            : e.points.some((p) => has(`${p.detail[lang]} ${p.why?.[lang] ?? ''}`))
              ? 3
              : -1
      if (rank !== -1) hits.push({ e, rank })
    }
    return hits.sort((a, b) => a.rank - b.rank).map((h) => h.e)
  }, [needle, lang])

  // The overview ("start") card is the entry point — pulled out of the group
  // loop so it can sit at the top, open by default, with no group header or
  // blurb wrapped around it.
  const startEntries = GUIDE.filter((e) => e.group === 'start')

  // One card renderer for the search results, so the open/target/deep-link wiring
  // stays identical no matter where the card sits. Each result wears its home
  // section's colour (sectionTintFor).
  const renderCard = (e: GuideEntry) => (
    <GuideCard
      key={e.id}
      entry={e}
      cardRef={e.id === openId ? targetRef : undefined}
      isTarget={e.id === openId}
      targetPoint={e.id === openId ? targetPoint ?? undefined : undefined}
      open={q.length > 0 || e.id === openId}
      pointsOpen={q.length > 0}
      highlight={q.length > 0 ? q : undefined}
      tint={sectionTintFor(e)}
      onReplayTour={start}
      onResetOnboarding={resetOnboarding}
    />
  )

  return (
    <OperatorSection title={t.operator.guideTitle} className="guide">
      <input
        type="search"
        className="guide__search"
        placeholder={t.operator.guideSearch}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t.operator.guideSearch}
      />

      {/* The feature map: every theme the app covers, at a glance. Hidden while
          searching (the results below are the answer then). A tile opens that
          theme's Réglages tab on its Comprendre lens. Same shared taxonomy the
          Board WelcomeCard + DevKit use. */}
      {!q && (
        <>
          <h3 className="guide__group-title">{t.operator.guideMap}</h3>
          <FeatureMap onSelect={openTheme} label={t.operator.guideMap} />
        </>
      )}

      {/* Searching: ONE flat list, best match first (title hits lead — see the
          rank memo above), every card open with its matches marked. The grouped
          manual below only renders at rest. */}
      {ranked &&
        (ranked.length === 0 ? (
          <EmptyState>{t.operator.guideNone}</EmptyState>
        ) : (
          <div className="guide__group">
            <h3 className="guide__group-title">{t.search.resultsCount(ranked.length)}</h3>
            <div className="guide__cards">{ranked.map(renderCard)}</div>
          </div>
        ))}

      {/* Overview card(s): expanded on arrival so a newcomer reads the summary at
          once, then the rest of the manual stays a calm, collapsed list below. */}
      {!ranked && startEntries.length > 0 && (
        <div className="guide__cards guide__cards--lead">
          {startEntries.map((e) => (
            <GuideCard
              key={e.id}
              entry={e}
              cardRef={e.id === openId ? targetRef : undefined}
              isTarget={e.id === openId}
              targetPoint={e.id === openId ? targetPoint ?? undefined : undefined}
              open
              pointsOpen={q.length > 0}
              onReplayTour={start}
              onResetOnboarding={resetOnboarding}
            />
          ))}
        </div>
      )}

      {/* Manage the first-run demo data (onboarding Phase 1): clear the examples or
          load them onto an empty household. Mirrors the board banner. Kept at the
          very bottom — operator maintenance, not part of the manual you read. */}
      {!q && <SampleDataControls />}
    </OperatorSection>
  )
}
