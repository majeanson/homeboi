import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { GUIDE, GUIDE_GROUPS, type GuideEntry, CONCEPT_THEMES } from '../../lib/guideContent'
import { renderRich, stripTokens } from '../../lib/richText'
import { useTour } from '../../lib/tour'
import { OperatorSection } from './OperatorSection'
import { FeatureMap } from '../FeatureMap'
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
  onReplayTour,
}: {
  entry: GuideEntry
  open?: boolean
  isTarget?: boolean
  cardRef?: Ref<HTMLDetailsElement>
  pointsOpen?: boolean
  showGoTo?: boolean
  // A specific sub-point to open + highlight + scroll to (contextual "?" deep-link).
  targetPoint?: number
  onReplayTour?: () => void
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
    <details ref={cardRef} className={`guide__card${isTarget ? ' is-target' : ''}`} open={open}>
      <summary className="guide__summary">
        <span className="guide__icon">
          <Icon name={entry.icon} size={26} />
        </span>
        <span className="guide__heads">
          <span className="guide__title">{entry.title[lang]}</span>
          <span className="guide__what">{renderRich(entry.what[lang])}</span>
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
              <summary className="guide__point-title">{renderRich(p.label[lang])}</summary>
              <p className="guide__point-detail">{renderRich(p.detail[lang])}</p>
              {/* The WHY, when the point earns one: a distinct, softer line so a
                  parent scans WHAT first, WHY second. */}
              {p.why && <p className="guide__point-why">{renderRich(p.why[lang])}</p>}
            </details>
          )
        })}
        {/* For a Settings-tab card surfaced in the Guide: a direct "go there"
            link that switches Réglages straight to that tab (?tab=<id>). Off
            when the card is shown inline on the tab it documents. */}
        {showGoTo && entry.tab && (
          <Link className="guide__goto" to={`/settings?tab=${entry.tab}`}>
            <span>{t.operator.guideGoTo}</span>
            <Icon name="arrow-right-bold" size={18} />
          </Link>
        )}
        {/* The "Première fois" card hosts the replay button: it starts the
            guided tour, which navigates to /board itself. */}
        {entry.action === 'replay-tour' && onReplayTour && (
          <button type="button" className="guide__goto" onClick={onReplayTour}>
            <Icon name="repeat-bold" size={18} />
            <span>{t.operator.replayTour}</span>
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
// The order a concept sits at *within* its theme bucket.
const themeInnerRank = (id: string) => {
  const th = CONCEPT_THEMES.find((t) => t.ids.includes(id))
  return th ? th.ids.indexOf(id) : 0
}

// Réglages ▸ Guide — the whole how-it-works manual in one place. Each concept is
// a collapsible card (native <details>, so it stays accessible and calm), and
// inside it every point is *itself* a collapsible: a clickable title that opens
// to reveal the one-sentence detail. Icons reuse the app's shared Phosphor-bold
// set (components/Icon), so the manual shows the very same glyphs as the live UI.
// A search box filters across titles, the one-line "what", and every point, in
// the current language. Content lives in lib/guideContent.ts; this is the view.
export function GuideSection() {
  const t = useT()
  const { lang } = useLang()
  const { start } = useTour()
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()

  // A section's help icon elsewhere links here as ?card=<id> (see SectionAvatar,
  // and HelpDot for section-level dots). Open that
  // card and scroll to it. We mirror the id into local state and CONSUME the
  // param (replace) so a refresh/back doesn't re-force it and the parent can
  // collapse it again. The effect (not initial state) is the real driver — it
  // also handles the case where the Guide tab is already mounted.
  const [openId, setOpenId] = useState<string | null>(() => params.get('card'))
  // A contextual "?" can also target a sub-POINT within the card (?point=<index>) —
  // the HelpBubble's "→ Voir le guide" link does this. We open + highlight + scroll
  // to that point, not just the card.
  const [targetPoint, setTargetPoint] = useState<number | null>(() => {
    const p = params.get('point')
    return p != null && p !== '' ? Number(p) : null
  })
  const targetRef = useRef<HTMLDetailsElement | null>(null)
  useEffect(() => {
    const card = params.get('card')
    if (!card) return
    setOpenId(card)
    const p = params.get('point')
    setTargetPoint(p != null && p !== '' ? Number(p) : null)
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

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return GUIDE
    const hit = (e: GuideEntry) =>
      stripTokens([e.title[lang], e.what[lang], ...e.points.flatMap((p) => [p.label[lang], p.detail[lang]])].join(' '))
        .toLowerCase()
        .includes(q)
    return GUIDE.filter(hit)
  }, [q, lang])

  // The overview ("start") card is the entry point — pulled out of the group
  // loop so it can sit at the top, open by default, with no group header or
  // blurb wrapped around it.
  const startEntries = matches.filter((e) => e.group === 'start')

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
      onReplayTour={() => start('essentials')}
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
        </>
      )}

      {matches.length === 0 && <EmptyState>{t.operator.guideNone}</EmptyState>}

      {/* Overview card(s): expanded on arrival so a newcomer reads the summary at
          once, then the rest of the manual stays a calm, collapsed list below. */}
      {startEntries.length > 0 && (
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
              onReplayTour={() => start('essentials')}
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
      {GUIDE_GROUPS.filter((g) => g.id !== 'start').map((group) => {
        const entries = matches.filter((e) => e.group === group.id)
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
                <div key={th.key} id={`guide-th-${th.key}`} className="guide__theme">
                  <h4 className="guide__theme-title">
                    <Icon name={th.icon} size={18} />
                    {th.label[lang]}
                  </h4>
                  <div className="guide__cards">{cards.map(renderCard)}</div>
                </div>
              ))}
              {rest.length > 0 && <div className="guide__cards">{rest.map(renderCard)}</div>}
            </div>
          )
        }

        // sections / settings keep their file order; both are feature-map jump
        // targets (guide-th-sections / guide-th-settings).
        return (
          <div key={group.id} id={`guide-th-${group.id}`} className="guide__group">
            <h3 className="guide__group-title">{group.label[lang]}</h3>
            <div className="guide__cards">{entries.map(renderCard)}</div>
          </div>
        )
      })}
    </OperatorSection>
  )
}
