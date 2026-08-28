import { useCallback, useEffect, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAi } from '../lib/ai'
import { isPaired, isGuestLocked } from '../lib/device'
import { useProfile } from '../lib/profile'
import { DisplaySection, VoiceSection, CalmSection, MeasureColorsSection } from '../components/operator/display'
import { AmbientSettingsSection, HabitCheckinSection } from '../components/operator/ambient'
import { BoardLayoutSection } from '../components/operator/boardLayout'
import { ShopSection, StoreFilterSection, HistorySection, GhostSection } from '../components/operator/shopping'
import { AisleOrderSection } from '../components/operator/aisles'
import { ClaimTablet, DevicesSection } from '../components/operator/devices'
import { MembersSection } from '../components/operator/household'
import { GuestSection } from '../components/operator/guest'
import { EventsSection, SchoolYearSection } from '../components/operator/agenda'
import { RoutinesSection } from '../components/operator/chores'
import { ChoresTabPanel } from '../components/operator/homeProjects'
import { PhotosSection, RecapSection } from '../components/operator/media'
import { ThisWeekTogetherSection } from '../components/operator/ThisWeekTogetherSection'
import { RecipeTagsSection } from '../components/operator/recipesTags'
import { RecipePillsSection } from '../components/operator/recipePills'
import { MealSlotsSection, MealWindowSection } from '../components/operator/meals'
import { ReserveLocationsSection } from '../components/operator/reserve'
import { CarsSection } from '../components/operator/cars'
import { ScheduleSection } from '../components/operator/schedule'
import { TodoTemplatesSection } from '../components/operator/todos'
import { CercleGroupsSection } from '../components/operator/cercle'
import { HouseDiarySection } from '../components/operator/HouseDiary'
import { AiErrorLogSection } from '../components/operator/aiErrors'
import { AiSection } from '../components/operator/ai'
import { BuildInfoSection } from '../components/operator/buildInfo'
import { HealthSection } from '../components/operator/healthCard'
import { TakeoutSection } from '../components/operator/takeout'
import { MicSelfTest } from '../components/operator/micTest'
import { KbDebugSection } from '../components/operator/kbDebug'
import { DiscoverSection, ComprendrePanel, resolveGuideCard } from '../components/operator/guide'
import { SECTION_TINT, THEME_ALIAS, cardHomeTab, type SectionKey } from '../lib/guideContent'
import { InlineIcon, type IconName } from '../components/Icon'
import { SubTabs } from '../components/SubTabs'
import { useHelpMode } from '../lib/helpMode'
import { OPERATOR_HELP } from '../lib/operatorHelp'
import { useTabParam } from '../lib/tabParam'
import { useHScroll } from '../lib/hscroll'
import { SETTINGS_SUBS, SUB_GOTO, type SettingsTabId } from '../lib/settingsNav'
import { scrollBehavior } from '../lib/motion'
import { MEMBERS_KEY, DEVICES_KEY, CHORES_KEY, EVENTS_KEY, BOARD_KEY, CERCLE_KEY, ROUTINES_KEY, HEALTH_KEY } from '../lib/queryKeys'
import type { Member, Device, Chore, Routine, EventRow } from '../components/operator/types'

// Réglages is one panel per tab; this list drives the tab strip. Deep links
// (/settings?tab=<id>) select the matching tab — the active tab lives in the URL
// (see lib/tabParam). The sections themselves live in src/components/operator/* —
// this page is just the shell: auth gate, queries, tab state, and the
// invalidation fan-out the sections call after a write.
// Réglages is « Découvrir » + SIX THEMED TABS — one per hub section, in the
// canonical importance order, each wearing its section's colour (SECTION_TINT)
// and icon (the hub nav's). A themed tab has two lenses (?lens=): « Comprendre »
// (that theme's slice of the guide — ComprendrePanel) and « Régler » (its
// settings sub-sections, the default). The tab `id` IS the SectionKey, so the
// taxonomy, the tints and the ?card= homing all share one id space; every
// retired id lives on in LEGACY_TAB so old /settings?tab=… links still land.
const SECTIONS: { id: string; icon: IconName }[] = [
  { id: 'decouvrir', icon: 'book-open-bold' }, // search-all + feature map + première fois
  { id: 'board', icon: 'sun-bold' }, //           events + layout + la semaine
  { id: 'kitchen', icon: 'carrot-bold' }, //      apparence (tags+pastilles+mesures) + repas + réserve
  { id: 'liste', icon: 'sparkle-bold' }, //       liste + allées + magasins + historique + ghost
  { id: 'notes', icon: 'file-text-bold' }, //     Comprendre-only — les notes du cercle, aucun Régler
  { id: 'maison', icon: 'house-bold' }, //        routines + corvées + à-compléter + membres + groupes + autos + horaires
  { id: 'settings', icon: 'gear-six-bold' }, //   Système: appareils + invités + affichage + veille + photos + IA + voix + calme + diagnostics
]

// Every retired tab id → the themed tab (and sub-section) that hosts it now, so
// ANY old /settings?tab=… link still lands right. `bySub` handles the three old
// tabs whose sub-sections split across themes (agenda, display, ai): the raw
// ?sub= picks the real target; sub keys themselves never changed, so a ?sub that
// stays within the base tab passes through useTabParam's valid-set untouched.
const LEGACY_TAB: Record<string, { tab: string; sub?: string; bySub?: Record<string, { tab: string; sub: string }> }> = {
  guide: { tab: 'decouvrir' },
  household: { tab: 'maison', sub: 'members' },
  devices: { tab: 'settings', sub: 'tablets' },
  agenda: {
    tab: 'board',
    sub: 'events',
    bySub: { cars: { tab: 'maison', sub: 'cars' }, schedule: { tab: 'maison', sub: 'schedule' } },
  },
  chores: { tab: 'maison', sub: 'chores' },
  recipes: { tab: 'kitchen', sub: 'apparence' },
  shopping: { tab: 'liste', sub: 'shop' },
  display: { tab: 'settings', sub: 'display', bySub: { layout: { tab: 'board', sub: 'layout' } } },
  ai: { tab: 'settings', sub: 'ai', bySub: { thisweek: { tab: 'board', sub: 'thisweek' } } },
  // The previously-retired ids, re-pointed at their themed homes:
  guest: { tab: 'settings', sub: 'guest' },
  auto: { tab: 'maison', sub: 'cars' },
  todos: { tab: 'maison', sub: 'todos' },
  meals: { tab: 'kitchen', sub: 'meals' },
  reserve: { tab: 'kitchen', sub: 'reserve' },
  ghost: { tab: 'liste', sub: 'ghost' },
  calm: { tab: 'settings', sub: 'calm' },
  photos: { tab: 'settings', sub: 'photos' },
  week: { tab: 'board', sub: 'thisweek' },
  'ai-log': { tab: 'settings', sub: 'system' },
  // 'cercle' and 'routines' DEMOTED back from real tab ids to aliases by the nav
  // restructure (Le cercle + Routines merged into Maison): no bySub needed here
  // — every old cercle/routines sub id lives on verbatim inside maison, so a raw
  // ?sub still in the valid set passes useTabParam untouched, and the sub named
  // below is only the no-?sub fallback (members first for the old cercle alias —
  // it used to mean the groups sub; routines first for the old routines alias).
  cercle: { tab: 'maison', sub: 'members' },
  routines: { tab: 'maison', sub: 'routines' },
}

// C-15 — retired ?sub= ids WITHIN a still-current tab (unlike LEGACY_TAB, whose
// keys are retired TAB ids). Kitchen's three colour subs (tags/pills/measure)
// folded into one « Apparence » sub; each old sub id resolves here regardless of
// which one a link named (order-independent — a Set would do, this stays
// self-documenting per source sub). Consulted only as a fallback for the
// current tab's sub picker; a still-valid ?sub takes priority.
const LEGACY_SUB: Record<string, Record<string, string>> = {
  kitchen: { tags: 'apparence', pills: 'apparence', measure: 'apparence' },
}

// Operator hub. Reached two ways: the signed-in operator (phone/laptop, full
// access) OR a parent-mode kiosk (a paired wall tablet — device token, no cookie),
// which gets in to change most settings but NOT member admin or device pairing
// (those two tabs are hidden + the server keeps their writes operator-only). A
// locked/toddler kiosk never gets here — HubLayout redirects it away. Each section
// is a thin CRUD strip — no dashboards, nothing to optimize-against (NFR-CALM).
export function Operator() {
  const t = useT()
  const nav = useNavigate()
  const { loading, signedIn, household, signOut } = useAuth()
  const { setMemberId } = useProfile()
  const qc = useQueryClient()

  // A paired wall tablet may open Réglages too; `signedIn` is the full operator.
  // A read-only LINK guest (the public demo) may open it as well — for the guide and
  // the device-local knobs, and nothing else. See GUEST_SUBS below.
  const paired = isPaired()
  const guest = isGuestLocked()
  const canEnter = signedIn || paired || guest

  // Fetch for either an operator OR a paired kiosk — an anon visitor still 401s.
  // Members GET is open (the agenda picker needs the faces even on a kiosk); the
  // WRITES under Membres stay operator-only and that tab is hidden for a kiosk.
  // Devices is operator-only top-to-bottom, so its read stays cookie-gated. Each
  // strip is independent so one failing read never blanks the rest (data?? []).
  // A guest reads none of it: every sub these feed is dropped for them, so fetching
  // would be four pointless round-trips (and `pair/devices` a guaranteed 403).
  const loadHousehold = canEnter && !guest
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members'), enabled: loadHousehold })
  const devicesQ = useQuery({ queryKey: DEVICES_KEY, queryFn: () => api<{ devices: Device[] }>('pair/devices'), enabled: signedIn })
  const choresQ = useQuery({ queryKey: CHORES_KEY, queryFn: () => api<{ chores: Chore[] }>('chores'), enabled: loadHousehold })
  const routinesQ = useQuery({ queryKey: ROUTINES_KEY, queryFn: () => api<{ routines: Routine[] }>('routines'), enabled: loadHousehold })
  const eventsQ = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api<{ events: EventRow[] }>('events'), enabled: loadHousehold })

  const members = membersQ.data?.members ?? []
  const devices = devicesQ.data?.devices ?? []
  const chores = choresQ.data?.chores ?? []
  const routines = routinesQ.data?.routines ?? []
  const events = eventsQ.data?.events ?? []
  // The household AI on/off state. The SWITCH lives in the IA tab (components/
  // operator/ai.tsx) — this page only reads `enabled` to decide whether the AI
  // error log is worth showing at all. See lib/ai.ts.
  const { enabled: aiEnabled } = useAi()

  // Child sections call this after a write. Invalidate the settings reads plus
  // ['board'] so member/chore/routine/event edits surface on the wall at once
  // (the ['routines'] key is shared with the Routines/KidView pages too).
  // CERCLE_KEY too: a member is a person in Le cercle, so a rename/recolour/delete
  // must refresh the circle (which reads /api/cercle, not /api/members).
  const load = useCallback(() => {
    for (const key of [MEMBERS_KEY, DEVICES_KEY, CHORES_KEY, ROUTINES_KEY, EVENTS_KEY, HEALTH_KEY, BOARD_KEY, CERCLE_KEY]) {
      qc.invalidateQueries({ queryKey: key })
    }
  }, [qc])

  useEffect(() => {
    if (!loading && !canEnter) nav('/login')
  }, [loading, canEnter, nav])

  // Which settings tab is open, held in the URL (?tab=<id>). A deep link selects
  // the matching tab (/settings?tab=maison) and the choice survives a refresh
  // or a return from elsewhere — unlike the old read-only hash. See tabParam.
  // "Still loading" counts as full access so an operator's deep link to a gated
  // sub-section survives the auth round-trip instead of snapping to the default.
  // A kiosk can't admin members, pair devices, or issue guest links — those are
  // SUB-sections now (under Le cercle and Système) and drop per-sub below; every
  // themed tab itself stays visible, and the server keeps those writes
  // operator-only regardless.
  const fullAccess = signedIn || loading
  const sectionIds = SECTIONS.map((s) => s.id)
  // Tab labels: the themed tabs reuse the very words the hub nav uses (t.nav.*
  // where one exists), so "the orange tab in the app" and "the orange tab in
  // Réglages" always read identically; Système is the sage machine-room.
  const sectionLabel: Record<string, string> = {
    decouvrir: t.operator.secDiscover,
    board: t.operator.secBoard,
    kitchen: t.operator.secKitchen,
    liste: t.nav.list,
    notes: t.nav.notes,
    maison: t.nav.maison,
    settings: t.operator.secSystem,
  }
  const [params, setParams] = useSearchParams()
  // The valid set also accepts every retired id, so an old deep link parses;
  // LEGACY_TAB folds it (sub-aware for the three split tabs) to the themed host.
  const [rawTab, setTab] = useTabParam('tab', sectionIds[0], [...sectionIds, ...Object.keys(LEGACY_TAB)])
  const rawSub = params.get('sub')
  const legacy = LEGACY_TAB[rawTab]
  const legacyTarget = legacy ? (rawSub ? legacy.bySub?.[rawSub] : undefined) ?? { tab: legacy.tab, sub: legacy.sub } : null
  let tab = legacyTarget ? legacyTarget.tab : rawTab
  if (!sectionIds.includes(tab)) tab = sectionIds[0]
  // ?card= homing: a guide-card deep-link (HelpDot / HelpBubble / EmptyState /
  // richText token / end-of-tour / search result) forces the card's home tab and
  // the Comprendre lens; ComprendrePanel then consumes the param and pins
  // tab+lens into the URL (see useGuideCardTarget), so the view stays put.
  const cardParam = params.get('card')
  const cardHome = cardParam ? cardHomeTab(resolveGuideCard(cardParam, null).id ?? '') : null
  if (cardHome && sectionIds.includes(cardHome)) tab = cardHome
  // « Comprendre / Régler » — the per-theme lens, default Régler (stored as no
  // param: Réglages is first a doing surface). Découvrir has no lens.
  const [lensParam, setLens] = useTabParam('lens', 'regler', ['comprendre', 'regler'])
  const lens = cardHome && cardHome !== 'decouvrir' ? 'comprendre' : lensParam
  // Legacy ?theme= links (the old Guide jump-grid tiles): open that theme's tab
  // on its Comprendre lens; old 5-bucket keys resolve through THEME_ALIAS.
  useEffect(() => {
    const theme = params.get('theme')
    if (!theme) return
    const home = THEME_ALIAS[theme] ?? theme
    const next = new URLSearchParams(params)
    next.delete('theme')
    next.set('tab', SECTIONS.some((s) => s.id === home) ? home : 'decouvrir')
    if (home !== 'decouvrir') next.set('lens', 'comprendre')
    setParams(next, { replace: true })
  }, [params, setParams])
  // ?focus= — a guide « Régler » link can name ONE section card inside a stacked
  // sub (by its help key, e.g. measureColors in kitchen▸apparence): scroll to it
  // with a brief accent ring, then consume the param (one functional setParams
  // write — two setters in a row would race, see the openTheme note in guide.tsx).
  // Polls a few beats: a conditional section (the AI log) can mount after its
  // query answers, same late-anchor reasoning as TourOverlay.
  useEffect(() => {
    if (!params.get('focus')) return
    const focus = params.get('focus')!
    let tries = 0
    const timer = window.setInterval(() => {
      const el = document.getElementById(`op-${focus}`)
      tries += 1
      if (!el && tries < 12) return
      window.clearInterval(timer)
      if (el) {
        el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
        el.classList.add('is-target')
        window.setTimeout(() => el.classList.remove('is-target'), 1800)
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('focus')
          return next
        },
        { replace: true },
      )
    }, 120)
    return () => window.clearInterval(timer)
  }, [params, setParams])
  const operatorHelp = useHelpMode(OPERATOR_HELP, (k: string) => {
    const labels: Record<string, string> = {
      reserveLocations: t.operator.reserveTitle,
      cars: t.operator.carsTitle,
      schedule: t.operator.schedTitle,
      ambient: t.operator.ambientTitle,
      display: t.operator.display,
      voice: t.operator.voiceTitle,
      measureColors: t.operator.measureColorsTitle,
      calm: t.operator.calmTitle,
      mealSlots: t.operator.mealColors,
      todoTemplates: t.todos.templatesTitle,
      recipeTags: t.operator.tagsTitle,
      shop: t.operator.shopping,
      storeFilter: t.operator.storeFilter,
      history: t.operator.history,
      ghost: t.operator.ghost,
      recipePills: t.operator.pillsTitle,
      recap: t.operator.recapTitle,
      photos: t.operator.photos,
      micTest: t.operator.micTestTitle,
      kbDebug: t.operator.kbDebugTitle,
      aiTest: t.operator.aiTestTitle,
      aiLog: t.operator.aiLogTitle,
      ai: t.operator.aiTitle,
      guest: t.guest.title,
      choreLedger: t.operator.ledgerTitle,
      cercleGroups: t.operator.cercleGroupsTitle,
      houseDiary: t.operator.diaryTitle,
    }
    return labels[k] ?? k
  }, tab)

  // Under 60rem the tab nav is a one-line scroll row with a hidden scrollbar, which a
  // mouse can't scroll sideways; this maps the wheel onto it. Above 60rem the nav is a
  // vertical sidebar and the hook no-ops (nothing overflows horizontally).
  const tabsScroll = useHScroll<HTMLElement>()

  // Each themed tab's « Régler » lens holds its sub-sections in a SubTabs pill
  // row ("one job at a time") instead of stacking every panel in one long scroll.
  // The sub ids AND their order come from SETTINGS_SUBS (lib/settingsNav) — the
  // one taxonomy source the guide's « Régler » links and guideLinks.test.ts also
  // read; this map only fills each id's label + panel, and the mapped type makes
  // a missing/extra body a tsc error, not a blank pill. Sub keys are UNCHANGED
  // from the old 9-tab layout, so old ?sub= links survive; the `label` reuses
  // each section's own title key so the pill matches the heading it opens.
  // Sections are homed on the theme they configure: the board tab owns what the
  // board SHOWS (agenda, layout, la semaine), Système owns the device/
  // household-wide machinery (access, display, veille, IA, diagnostics).
  const subBodies: { [T in SettingsTabId]: Record<(typeof SETTINGS_SUBS)[T][number], { label: string; node: ReactNode }> } = {
    board: {
      // D-17 « La rentrée »: SchoolYearSection stacks under the SAME 'events' pill
      // as EventsSection (C-15 standing rule — a new setting merges into an
      // existing sub, never adds a pill; same board▸thisweek precedent).
      events: {
        label: t.operator.events,
        node: (
          <>
            <EventsSection events={events} members={members} onChange={load} />
            <SchoolYearSection help={operatorHelp} />
          </>
        ),
      },
      layout: { label: t.operator.boardLayout, node: <BoardLayoutSection help={operatorHelp} /> },
      // « La semaine » — the calm week glance + the AI weekly recap, one pill.
      thisweek: {
        label: t.operator.weekTabTitle,
        node: (
          <>
            <ThisWeekTogetherSection help={operatorHelp} />
            <RecapSection help={operatorHelp} />
          </>
        ),
      },
    },
    kitchen: {
      // C-15 — étiquettes + pastilles + couleurs de mesure were three separate
      // colour-tinkering pills; folded into ONE « Apparence » sub (stacked
      // bodies under one pill, the board▸thisweek / settings▸system precedent —
      // no nested SubTabs). Listed first so it's the useTabParam fallback.
      apparence: {
        label: t.operator.kitchenLookTitle,
        node: (
          <>
            <RecipeTagsSection help={operatorHelp} />
            <RecipePillsSection help={operatorHelp} />
            <MeasureColorsSection help={operatorHelp} />
          </>
        ),
      },
      // « Jours affichés » stacks under the SAME 'meals' pill as MealSlotsSection
      // (C-15 standing rule — a new setting merges into the sub that already owns
      // the concept, never adds a pill; the board▸events / SchoolYearSection
      // precedent). The slots section owns the meals OF a day; this one owns how
      // many days the grid reaches.
      meals: {
        label: t.operator.mealColors,
        node: (
          <>
            <MealSlotsSection help={operatorHelp} />
            <MealWindowSection help={operatorHelp} />
          </>
        ),
      },
      reserve: { label: t.operator.reserveTitle, node: <ReserveLocationsSection help={operatorHelp} /> },
    },
    liste: {
      shop: { label: t.operator.shopping, node: <ShopSection help={operatorHelp} /> },
      aisles: { label: t.operator.aisleOrder, node: <AisleOrderSection /> },
      stores: { label: t.operator.storeFilter, node: <StoreFilterSection help={operatorHelp} /> },
      history: { label: t.operator.history, node: <HistorySection help={operatorHelp} /> },
      ghost: { label: t.operator.ghost, node: <GhostSection help={operatorHelp} /> },
    },
    // Maison merges the old cercle + routines tabs (nav restructure); sub ORDER
    // follows SETTINGS_SUBS.maison — the namesake « routines » sub leads (also
    // keeps legacy ?tab=routines landing here), then the old cercle subs. « Les
    // notes » (the old Social/Famille notes point) moved out to its own
    // Comprendre-only tab, so it has no body here.
    maison: {
      routines: { label: t.operator.routines, node: <RoutinesSection routines={routines} onChange={load} /> },
      chores: { label: t.operator.chores, node: <ChoresTabPanel chores={chores} onChange={load} help={operatorHelp} /> },
      todos: { label: t.todos.templatesTitle, node: <TodoTemplatesSection help={operatorHelp} /> },
      members: { label: t.operator.members, node: <MembersSection members={members} onChange={load} /> },
      cercle: { label: t.operator.cercleGroupsTitle, node: <CercleGroupsSection help={operatorHelp} /> },
      // L'auto + per-member hours live in Maison's world (getting-around, berry).
      cars: { label: t.operator.carsTitle, node: <CarsSection help={operatorHelp} /> },
      schedule: { label: t.operator.schedTitle, node: <ScheduleSection help={operatorHelp} /> },
      // « La maison cette année » (B-8, bmad/09) — the house's diary, a read view.
      annee: { label: t.operator.diaryTab, node: <HouseDiarySection help={operatorHelp} /> },
    },
    settings: {
      tablets: {
        label: t.operator.devices,
        node: (
          <>
            <ClaimTablet onClaimed={load} />
            <DevicesSection devices={devices} onChange={load} />
          </>
        ),
      },
      guest: { label: t.guest.title, node: <GuestSection help={operatorHelp} /> },
      display: { label: t.operator.display, node: <DisplaySection help={operatorHelp} /> },
      // « Mode veille » — two stacked bodies under ONE pill (C-15): what the idle
      // screen does on its own, then when « Le point du jour » opens on its own.
      ambient: {
        label: t.operator.ambientTitle,
        node: (
          <>
            <AmbientSettingsSection help={operatorHelp} />
            <HabitCheckinSection help={operatorHelp} />
          </>
        ),
      },
      photos: { label: t.operator.photos, node: <PhotosSection help={operatorHelp} /> },
      ai: { label: t.operator.aiTitle, node: <AiSection help={operatorHelp} /> },
      voice: { label: t.operator.voiceTitle, node: <VoiceSection help={operatorHelp} /> },
      calm: { label: t.operator.calmTitle, node: <CalmSection help={operatorHelp} /> },
      // « Version & diagnostics » — service health (which optional pieces are wired,
      // and what quietly hides without them) + build info + « Emporter mes données »
      // (E-35) + mic self-test + (when AI is on) the error log, grouped as one pill.
      system: {
        label: t.operator.sysTabTitle,
        node: (
          <>
            <HealthSection />
            <BuildInfoSection />
            <TakeoutSection />
            <MicSelfTest help={operatorHelp} />
            <KbDebugSection help={operatorHelp} />
            {aiEnabled && <AiErrorLogSection help={operatorHelp} />}
          </>
        ),
      },
    },
  }
  const subSections: Record<string, { key: string; label: string; node: ReactNode }[]> = Object.fromEntries(
    (Object.keys(subBodies) as SettingsTabId[]).map((tabId) => [
      tabId,
      SETTINGS_SUBS[tabId].map((k) => ({ key: k, ...(subBodies[tabId] as Record<string, { label: string; node: ReactNode }>)[k] })),
    ]),
  )

  // Kiosk gating, per-sub: member/group admin, tablet pairing and guest links are
  // operator-only — dropped from the pill row AND the valid ?sub set, so a deep
  // link folds to the tab's first visible sub instead of bypassing the gate.
  const gatedSubs: Record<string, string[]> = fullAccess ? {} : { maison: ['members', 'cercle'], settings: ['tablets', 'guest'] }

  // Guest gating, per-sub — an ALLOWLIST, not a denylist, because the safe set is the
  // small one and a sub added later must not silently open itself to the demo. These
  // five are exactly the subs whose every control writes localStorage: « Disposition »
  // (lib/boardCards), « Affichage » (theme/lang/lens/a11y), « Mode veille »
  // (lib/ambient), « Voix » (lib/speak) and « Calme ». Everything else reads or writes
  // the household — Membres, Tablettes, Invités, Photos, IA, and « Version &
  // diagnostics » (which carries « Emporter mes données », an export of the whole
  // household). Note « Apparence » stays out: it looks device-local, but
  // MeasureColorsSection PATCHes /api/household.
  //
  // Comprendre — the guide — stays open on every tab, and Découvrir has no subs at
  // all, so a guest always has something to read even where Régler is empty.
  const GUEST_SUBS: Record<string, string[]> = { board: ['layout'], settings: ['display', 'ambient', 'voice', 'calm'] }

  // The current tab's sub-sections + which one is open, held in the URL (?sub=<key>)
  // so a sub-tab survives a refresh / return-from-scene and composes with ?tab=. The
  // sub fallback comes from a retired-tab fold when the URL used one and named no
  // explicit ?sub (so /settings?tab=chores opens Routines ▸ Corvées), else the tab's
  // first sub. useTabParam folds an out-of-set ?sub (e.g. left over from another tab)
  // to that fallback, so switching tabs always lands on a valid sub.
  //
  // `subs` is null when this tab offers the viewer no Régler side at all (Découvrir,
  // or any tab a guest can't configure) — the lens toggle then drops to Comprendre
  // alone rather than rendering an empty pill row.
  const visibleSubs = subSections[tab]
    ? subSections[tab].filter((s) => (guest ? (GUEST_SUBS[tab] ?? []).includes(s.key) : !gatedSubs[tab]?.includes(s.key)))
    : null
  const subs = visibleSubs && visibleSubs.length > 0 ? visibleSubs : null
  const subKeys = subs ? subs.map((s) => s.key) : []
  const aliasSub = legacyTarget?.sub
  // A retired within-tab sub (e.g. /settings?tab=kitchen&sub=tags) folds via
  // LEGACY_SUB before falling to the tab's first sub — checked ahead of the
  // LEGACY_TAB alias since it's the more specific match (same tab, old sub).
  const legacySub = rawSub ? LEGACY_SUB[tab]?.[rawSub] : undefined
  const subFallback =
    legacySub && subKeys.includes(legacySub)
      ? legacySub
      : aliasSub && subKeys.includes(aliasSub)
        ? aliasSub
        : (subKeys[0] ?? '')
  const [sub, setSub] = useTabParam('sub', subFallback, subKeys)
  const activeSub = subs?.find((s) => s.key === sub) ?? subs?.[0]

  if (loading || !canEnter) return <p className="loading mono">{t.common.loading}</p>

  return (
    <main className="operator">
      {/* No « Réglages » H1: the nav tab at the foot says the word and is the lit
          one — the heading spent a whole line of a 844px phone repeating it, on a
          page that already stacks three control rails (themed tabs · Comprendre /
          Régler · subs) before its first setting. Same rule as « Les notes » and the
          recipe book. `operator__head` is now the identity line alone. */}
      {/* The heading survives for screen readers only: dropping it outright would
          leave the page with no h1 at all, which is a real regression — every other
          hub tab has one (HubHead renders it). Visually it is the lit nav tab that
          says « Réglages ». */}
      <h1 className="sr-only">{t.nav.operator}</h1>
      <div className="operator__head">
        {/* A guest gets no household chrome: no household name to leak, no IA switch
            (that one's a write), no session to sign out of, and no « Se connecter »
            nudge — HubLayout's banner already says what this session is. */}
        {!guest && (
        <div className="operator__meta mono">
          <span>{household?.name}</span>
          {/* The « IA : active » tag used to live here as a quick on/off switch. It
              is gone (Marc, 2026-08-28): the IA tab already carries the same toggle
              WITH its explanation and its « En savoir plus » link, so this was a
              second spelling of one control on the line you read first — and it
              spent that line on a setting almost nobody flips. Réglages ▸ IA is the
              one door now. */}
          {/* Sign-IN stays up here: for a kiosk it is the ENABLING action — the
              door to the operator-only subs, and the kioskNotice right below
              explains why. Sign-OUT moved to the foot of the page (see below): it
              is the rarest and most consequential thing here, and it was the second
              thing you saw. */}
          {!signedIn && (
            <button type="button" className="btn btn--ghost mono" onClick={() => nav('/login')}>
              {t.operator.kioskSignIn}
            </button>
          )}
        </div>
        )}
      </div>

      {/* Two different "you can't change everything here" notes: a kiosk is invited to
          sign in for the operator-only subs; a guest can't sign in at all, so say what
          IS theirs (the guide, and this device's own display) instead of dangling a
          door that doesn't open. */}
      {guest ? (
        <p className="operator__kiosk-note mono">{t.operator.guestNotice}</p>
      ) : (
        !signedIn && <p className="operator__kiosk-note mono">{t.operator.kioskNotice}</p>
      )}

      {/* Settings navigation: a sticky vertical sidebar on a wide screen (kiosk/
          desktop, its own scroll region), a one-line scroll row on a phone.
          Découvrir + the six themed tabs, each wearing its section's colour
          (SECTION_TINT as --tab-ink/--tab-wash) and hub-nav icon. Deep links
          resolve through LEGACY_TAB, so every old ?tab=<id> still lands. */}
      <div className="operator__body">
        <nav
          ref={tabsScroll.ref}
          className="operator__tabs mono"
          role="tablist"
          aria-label={t.operator.sections}
          onKeyDown={(e) => {
            // Roving arrow-key navigation between tabs (ArrowLeft/Right on the phone
            // row, Up/Down on the wide sidebar) + Home/End, per the WAI-ARIA tablist.
            const i = sectionIds.indexOf(tab)
            let n = i
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % sectionIds.length
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + sectionIds.length) % sectionIds.length
            else if (e.key === 'Home') n = 0
            else if (e.key === 'End') n = sectionIds.length - 1
            else return
            e.preventDefault()
            const id = sectionIds[n]
            setTab(id)
            document.getElementById(`op-tab-${id}`)?.focus()
          }}
        >
          {SECTIONS.map((s) => {
            const tint = s.id in SECTION_TINT ? SECTION_TINT[s.id as SectionKey] : undefined
            return (
              <button
                key={s.id}
                id={`op-tab-${s.id}`}
                type="button"
                role="tab"
                aria-selected={tab === s.id}
                aria-controls="operator-panel"
                tabIndex={tab === s.id ? 0 : -1}
                className={`operator__tab${tab === s.id ? ' is-active' : ''}`}
                style={tint ? ({ '--tab-ink': tint.ink, '--tab-wash': tint.wash } as CSSProperties) : undefined}
                onClick={() => setTab(s.id)}
              >
                <InlineIcon name={s.icon} size={15} color={tint?.ink} />
                {sectionLabel[s.id]}
              </button>
            )
          })}
        </nav>

        <div className="operator__panel" role="tabpanel" id="operator-panel" aria-labelledby={`op-tab-${tab}`} tabIndex={0}>
          {/* Découvrir is one body of its own (search-all + feature map). A themed
              tab leads with its « Comprendre / Régler » lens toggle: Comprendre =
              that theme's slice of the guide, Régler = its settings sub-sections
              one at a time behind a SubTabs pill row — both in the section's hue. */}
          {tab === 'decouvrir' ? (
            <DiscoverSection />
          ) : (
            <>
              {/* No Régler side on this tab for this viewer (a guest outside GUEST_SUBS):
                  drop the lens toggle rather than offer a pill that opens nothing, and
                  let the guide stand on its own. */}
              {subs && (
                <div className="operator__lensrow">
                  <SubTabs
                    size="mini"
                    className="operator__lens"
                    options={[
                      { key: 'comprendre' as const, label: t.operator.lensLearn, icon: 'book-open-bold' as IconName },
                      { key: 'regler' as const, label: t.operator.lensSet, icon: 'gear-six-bold' as IconName },
                    ]}
                    value={lens}
                    onSelect={setLens}
                    ariaLabel={t.operator.lensAria}
                    tint={tab in SECTION_TINT ? SECTION_TINT[tab as SectionKey].ink : undefined}
                  />
                  {/* « Voir dans l'app » — the way back to the live surface this sub
                      configures (SUB_GOTO, the board▸Disposition mirror generalized).
                      Subs that are pure machinery have no entry. It used to own a whole
                      row between the sub rail and the first setting; it rides the lens
                      row's empty right half instead, which is also where it belongs:
                      Comprendre · Régler · go SEE it. The label hides on a narrow phone
                      (the ↗ glyph + its aria-label/title carry it there) and returns the
                      moment there's room — never an unnamed control. */}
                  {lens === 'regler' && activeSub && SUB_GOTO[`${tab}/${activeSub.key}`] && (
                    <Link
                      className="operator__goto mono"
                      to={SUB_GOTO[`${tab}/${activeSub.key}`]}
                      aria-label={t.operator.gotoFeature}
                      title={t.operator.gotoFeature}
                    >
                      <InlineIcon name="arrow-up-right-bold" size={14} />
                      <span>{t.operator.gotoFeature}</span>
                    </Link>
                  )}
                </div>
              )}
              {lens === 'regler' && subs ? (
                <>
                  <SubTabs
                    options={subs.map((s) => ({ key: s.key, label: s.label }))}
                    value={activeSub?.key ?? subs[0].key}
                    onSelect={setSub}
                    ariaLabel={t.operator.jumpAria}
                    tint={tab in SECTION_TINT ? SECTION_TINT[tab as SectionKey].ink : undefined}
                  />
                  {activeSub?.node}
                </>
              ) : (
                <ComprendrePanel section={tab as SectionKey} />
              )}
            </>
          )}
        </div>
      </div>

      {/* « Déconnexion » — at the FOOT, on every tab. It used to sit second from the
          top, above the tab rail: the rarest action in the app, and the loudest thing
          on the page after the heading. Down here it is still one scroll from
          anywhere in Réglages and it stops competing with the settings you came for.
          A guest has no session to drop (and no household chrome at all). */}
      {!guest && signedIn && (
        <div className="operator__signout">
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              // Drop the picked face with the session — on a shared device the next
              // family signing in must not inherit a ghost member id (the X-Profile
              // header would mis-attribute their writes).
              setMemberId(null)
              signOut().then(() => nav('/'))
            }}
          >
            {t.nav.logout}
          </button>
        </div>
      )}
    </main>
  )
}
