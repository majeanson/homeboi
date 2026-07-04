import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { GUIDE, GUIDE_GROUPS, type GuideEntry, CONCEPT_THEMES, SECTION_TINT, type SectionKey } from '../../lib/guideContent'
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
// state, and SectionGuide reuses this very card inline in each Réglages tab so
// each section now carries its own how-it-works (showGoTo off — you're already
// on the tab it would point to).
export function GuideCard({
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

// The "concepts" cards read best clustered by theme rather than in the order
// they were authored (the file grows concept-by-concept, so it drifts toward
// append-order). Display order: the everyday basics first, then board/device
// concepts, then the kitchen/recipe cluster, then the shopping/deals cluster.
// This keeps related cards adjacent (recipes↔cook mode, deals↔flyers) without
// moving the bilingual prose blocks around in guideContent.ts. The "sections"
// group keeps its file order, which already matches the six tabs.
// NOTE: a new concept not listed here falls to the end (file order preserved) —
// add its id below to place it in the right cluster.
const CONCEPT_ORDER = [
  'capture',
  'surface',
  'audience',
  'calm',
  'undo',
  'offline',
  'reminders',
  'pairing',
  'account',
  'recipes',
  'cookmode',
  'leftovers',
  'reserve',
  'deals',
  'flyers',
  'cashier',
  'ghost',
]
const conceptRank = (id: string) => {
  const i = CONCEPT_ORDER.indexOf(id)
  return i === -1 ? CONCEPT_ORDER.length : i
}

// The concepts group is the biggest (~24 cards) — rendered as themed sub-clusters
// (CONCEPT_THEMES, the shared taxonomy in guideContent) instead of a flat wall.
const conceptThemeOf = (id: string) => CONCEPT_THEMES.find((th) => th.ids.includes(id))?.key

// The section colour (SECTION_TINT ink) a card should wear, so every card in the
// Guide reads in the hue of the section it documents — "proper mapping", one
// source (SECTION_TINT, itself mirroring the nav). A section card's id IS a
// SectionKey (board/kitchen/…); a concept card inherits its theme's section; a
// settings card is Réglages' sage. Start (overview) cards keep the default accent.
const sectionTintFor = (e: GuideEntry): string | undefined => {
  if (e.group === 'sections' && e.id in SECTION_TINT) return SECTION_TINT[e.id as SectionKey].ink
  if (e.group === 'settings') return SECTION_TINT.settings.ink
  if (e.group === 'concepts') {
    const th = CONCEPT_THEMES.find((t) => t.ids.includes(e.id))
    if (th) return SECTION_TINT[th.section].ink
  }
  return undefined
}
// The order a concept sits at *within* its theme bucket.
const themeInnerRank = (id: string) => {
  const th = CONCEPT_THEMES.find((t) => t.ids.includes(id))
  return th ? th.ids.indexOf(id) : 0
}

// The "settings" group mirrors the Réglages sidebar, so the manual reads in the same
// order as the app's tabs (household → devices → agenda → chores → recipes → shopping
// → display → ai). One consolidated card per host tab; this is the display order.
const SETTINGS_ORDER = [
  'set-household',
  'set-devices',
  'set-agenda',
  'set-chores',
  'set-recipes',
  'set-shopping',
  'set-display',
  'set-ai',
]
const settingsRank = (id: string) => {
  const i = SETTINGS_ORDER.indexOf(id)
  return i === -1 ? SETTINGS_ORDER.length : i
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
// Resolve a (?card, ?point) deep-link through the alias map above.
const resolveGuideCard = (card: string | null, point: number | null): { id: string | null; point: number | null } => {
  if (!card) return { id: null, point }
  const alias = SETTINGS_CARD_ALIAS[card]
  if (alias) return { id: alias.id, point: alias.base + (point ?? 0) }
  return { id: card, point }
}

// Réglages ▸ Guide — the whole how-it-works manual in one place. Each concept is
// a collapsible card (native <details>, so it stays accessible and calm), and
// inside it every point is *itself* a collapsible: a clickable title that opens
// to reveal the one-sentence detail. Icons reuse the app's shared Phosphor-bold
// set (components/Icon), so the manual shows the very same glyphs as the live UI.
// A search box matches across titles, the one-line "what", and every point
// (label + detail + why) in the current language — accent-insensitive (fold),
// ranked so a TITLE hit lands first, with every match <mark>ed in the results.
// Content lives in lib/guideContent.ts; this is the view.
export function GuideSection() {
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

  // A section's help icon elsewhere links here as ?card=<id> (see SectionAvatar,
  // and HelpDot for section-level dots). Open that
  // card and scroll to it. We mirror the id into local state and CONSUME the
  // param (replace) so a refresh/back doesn't re-force it and the parent can
  // collapse it again. The effect (not initial state) is the real driver — it
  // also handles the case where the Guide tab is already mounted.
  // ?card / ?point are resolved through SETTINGS_CARD_ALIAS so a deep-link to an old
  // (pre-consolidation) settings card still lands on the consolidated one + right point.
  const [openId, setOpenId] = useState<string | null>(
    () => resolveGuideCard(params.get('card'), parseGuidePoint(params.get('point'))).id,
  )
  // A contextual "?" can also target a sub-POINT within the card (?point=<index>) —
  // the HelpBubble's "→ Voir le guide" link does this. We open + highlight + scroll
  // to that point, not just the card.
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
    setParams(next, { replace: true })
  }, [params, setParams])
  useEffect(() => {
    if (openId && targetRef.current) targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openId])
  // A feature-map tile elsewhere (the Board WelcomeCard) deep-links to a whole
  // THEME via ?theme=<key>; scroll to that block and consume the param.
  useEffect(() => {
    const theme = params.get('theme')
    if (!theme) return
    document.getElementById(`guide-th-${theme}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const next = new URLSearchParams(params)
    next.delete('theme')
    setParams(next, { replace: true })
  }, [params, setParams])

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

  // One card renderer reused everywhere (lead, groups, concept sub-themes) so the
  // open/target/deep-link wiring stays identical no matter where the card sits.
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
  // Scroll a feature-map tile's target block into view (anchored by id below).
  const jumpTo = (key: string) => {
    document.getElementById(`guide-th-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
          searching (the results below are the answer then). Jump-scrolls to a
          theme block. Same shared taxonomy the Board WelcomeCard + DevKit use. */}
      {!q && (
        <>
          <h3 className="guide__group-title">{t.operator.guideMap}</h3>
          <FeatureMap onSelect={jumpTo} label={t.operator.guideMap} />
          {/* Manage the first-run demo data (onboarding Phase 1): clear the examples
              or load them onto an empty household. Mirrors the board banner. */}
          <SampleDataControls />
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

      {/* The real groups — six sections, the cross-cutting concepts, then the
          per-tab "settings" cards. Titles only (no blurb): each card's own
          one-line "what" carries the explanation, so the landing stays
          card-focused, not prose-heavy. The settings cards ALSO live inline in
          their own Réglages tab (see SectionGuide) — but they're listed here too
          so the Guide is the whole manual in one place AND so a contextual "?"
          deep-link into a settings card (?card=set-display&point=…) actually
          resolves, opens and highlights here, instead of falling through to the
          top of the Guide. Each settings card keeps its "go there" link. */}
      {!ranked && GUIDE_GROUPS.filter((g) => g.id !== 'start').map((group) => {
        const entries = GUIDE.filter((e) => e.group === group.id)
        if (entries.length === 0) return null

        // The concepts group is big — render it as themed sub-sections (one block
        // per CONCEPT_THEME) instead of a flat wall, so the manual reads as a map.
        // Each block is a feature-map jump target (guide-th-<theme.key>).
        if (group.id === 'concepts') {
          const themed = CONCEPT_THEMES.map((th) => ({
            th,
            cards: entries
              .filter((e) => conceptThemeOf(e.id) === th.key)
              .sort((a, b) => themeInnerRank(a.id) - themeInnerRank(b.id)),
          })).filter((b) => b.cards.length > 0)
          // Concepts not assigned to any theme — keep them visible at the end.
          const rest = entries
            .filter((e) => !conceptThemeOf(e.id))
            .sort((a, b) => conceptRank(a.id) - conceptRank(b.id))
          return (
            <div key={group.id} className="guide__group">
              <h3 className="guide__group-title">{group.label[lang]}</h3>
              {themed.map(({ th, cards }) => (
                <div
                  key={th.key}
                  id={`guide-th-${th.key}`}
                  className="guide__theme"
                  // The theme wears its section's colour: a left accent spine + a
                  // coloured heading glyph, so « Cuisine & épicerie » reads as La
                  // cuisine's terracotta, etc. (SECTION_TINT — one shared mapping).
                  style={
                    {
                      '--theme-ink': SECTION_TINT[th.section].ink,
                      '--theme-wash': SECTION_TINT[th.section].wash,
                    } as CSSProperties
                  }
                >
                  <h4 className="guide__theme-title">
                    <Icon name={th.icon} size={18} color={SECTION_TINT[th.section].ink} />
                    {th.label[lang]}
                  </h4>
                  <div className="guide__cards">{cards.map(renderCard)}</div>
                </div>
              ))}
              {rest.length > 0 && <div className="guide__cards">{rest.map(renderCard)}</div>}
            </div>
          )
        }

        // sections keeps its file order (already matches the six tabs); settings is
        // sorted to mirror the Réglages sidebar (SETTINGS_ORDER). Both are feature-map
        // jump targets (guide-th-sections / guide-th-settings).
        const ordered =
          group.id === 'settings' ? [...entries].sort((a, b) => settingsRank(a.id) - settingsRank(b.id)) : entries
        return (
          <div key={group.id} id={`guide-th-${group.id}`} className="guide__group">
            <h3 className="guide__group-title">{group.label[lang]}</h3>
            <div className="guide__cards">{ordered.map(renderCard)}</div>
          </div>
        )
      })}
    </OperatorSection>
  )
}
