import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAi, useAiToggle } from '../lib/ai'
import { isPaired } from '../lib/device'
import { useProfile } from '../lib/profile'
import { DisplaySection, VoiceSection, CalmSection, MeasureColorsSection } from '../components/operator/display'
import { AmbientSettingsSection } from '../components/operator/ambient'
import { BoardLayoutSection } from '../components/operator/boardLayout'
import { ShopSection, StoreFilterSection, HistorySection, GhostSection } from '../components/operator/shopping'
import { AisleOrderSection } from '../components/operator/aisles'
import { ClaimTablet, DevicesSection } from '../components/operator/devices'
import { MembersSection } from '../components/operator/household'
import { GuestSection } from '../components/operator/guest'
import { EventsSection } from '../components/operator/agenda'
import { RoutinesSection } from '../components/operator/chores'
import { ChoresTabPanel } from '../components/operator/homeProjects'
import { PhotosSection, RecapSection } from '../components/operator/media'
import { ThisWeekTogetherSection } from '../components/operator/ThisWeekTogetherSection'
import { RecipeTagsSection } from '../components/operator/recipesTags'
import { RecipePillsSection } from '../components/operator/recipePills'
import { MealSlotsSection } from '../components/operator/meals'
import { ReserveLocationsSection } from '../components/operator/reserve'
import { CarsSection } from '../components/operator/cars'
import { ScheduleSection } from '../components/operator/schedule'
import { TodoTemplatesSection } from '../components/operator/todos'
import { CercleGroupsSection } from '../components/operator/cercle'
import { AiErrorLogSection } from '../components/operator/aiErrors'
import { AiSection } from '../components/operator/ai'
import { IdleDebugSection } from '../components/operator/idleDebug'
import { BuildInfoSection } from '../components/operator/buildInfo'
import { MicSelfTest } from '../components/operator/micTest'
import { GuideSection } from '../components/operator/guide'
import { SectionGuide } from '../components/operator/sectionGuide'
import { OperatorJump } from '../components/operator/OperatorJump'
import { useHelpMode } from '../lib/helpMode'
import { OPERATOR_HELP } from '../lib/operatorHelp'
import { useTabParam } from '../lib/tabParam'
import { MEMBERS_KEY, DEVICES_KEY, CHORES_KEY, EVENTS_KEY, BOARD_KEY, CERCLE_KEY } from '../lib/queryKeys'
import type { Member, Device, Chore, Routine, EventRow } from '../components/operator/types'

// Réglages is one panel per tab; this list drives the tab strip. Deep links
// (/settings?tab=<id>) select the matching tab — the active tab lives in the URL
// (see lib/tabParam). The sections themselves live in src/components/operator/* —
// this page is just the shell: auth gate, queries, tab state, and the
// invalidation fan-out the sections call after a write.
// Réglages is now 9 task-oriented tabs (down from 21 thin ones): related sections
// stack as sub-sections under one tab, grouped by the mindset you're in when you
// change them. Order here = the sidebar order. The `id` is the tab's stable deep-link
// key (?tab=<id>); the 12 retired ids live on as aliases (TAB_ALIAS) so every old
// /settings?tab=… link still lands on the right tab.
const SECTIONS = [
  { id: 'guide', key: 'guide' as const },
  { id: 'household', key: 'secMaisonnee' as const }, // members + cercle
  { id: 'devices', key: 'secAccess' as const }, //     tablets + guest links (operator-only)
  { id: 'agenda', key: 'secAgenda' as const }, //      events + car/schedule
  { id: 'chores', key: 'secTasks' as const }, //       chores + routines + à-compléter
  { id: 'recipes', key: 'secKitchen' as const }, //    recipes + measure pills + meals + réserve
  { id: 'shopping', key: 'secShopping' as const }, //  list config + aisles + stores + history + ghost
  { id: 'display', key: 'secBoard' as const }, //      display + layout + ambient + photos + voice + calm
  { id: 'ai', key: 'secSystem' as const }, //          cette semaine + recap + AI + diagnostics
]

// Retired tab id → the merged tab that now hosts it, so a deep link to an old
// section (/settings?tab=routines) still opens the right tab. The valid-tab set
// passed to useTabParam includes these keys; resolveTab() folds them to the host.
const TAB_ALIAS: Record<string, string> = {
  cercle: 'household',
  guest: 'devices',
  auto: 'agenda',
  routines: 'chores',
  todos: 'chores',
  meals: 'recipes',
  reserve: 'recipes',
  ghost: 'shopping',
  calm: 'display',
  photos: 'display',
  week: 'ai',
  'ai-log': 'ai',
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
  const paired = isPaired()
  const canEnter = signedIn || paired

  // Fetch for either an operator OR a paired kiosk — an anon visitor still 401s.
  // Members GET is open (the agenda picker needs the faces even on a kiosk); the
  // WRITES under Membres stay operator-only and that tab is hidden for a kiosk.
  // Devices is operator-only top-to-bottom, so its read stays cookie-gated. Each
  // strip is independent so one failing read never blanks the rest (data?? []).
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members'), enabled: canEnter })
  const devicesQ = useQuery({ queryKey: DEVICES_KEY, queryFn: () => api<{ devices: Device[] }>('pair/devices'), enabled: signedIn })
  const choresQ = useQuery({ queryKey: CHORES_KEY, queryFn: () => api<{ chores: Chore[] }>('chores'), enabled: canEnter })
  const routinesQ = useQuery({ queryKey: ['routines'], queryFn: () => api<{ routines: Routine[] }>('routines'), enabled: canEnter })
  const eventsQ = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api<{ events: EventRow[] }>('events'), enabled: canEnter })

  const members = membersQ.data?.members ?? []
  const devices = devicesQ.data?.devices ?? []
  const chores = choresQ.data?.chores ?? []
  const routines = routinesQ.data?.routines ?? []
  const events = eventsQ.data?.events ?? []
  // The household AI on/off switch, surfaced as the header tag (now a toggle) and a
  // dedicated tab. `available` = the binding exists (can enable); `enabled` = the
  // effective on/off the whole UI gates on. See lib/ai.ts.
  const { enabled: aiEnabled, available: aiAvailable } = useAi()
  const aiToggle = useAiToggle()
  const [aiBusy, setAiBusy] = useState(false)

  // Child sections call this after a write. Invalidate the settings reads plus
  // ['board'] so member/chore/routine/event edits surface on the wall at once
  // (the ['routines'] key is shared with the Routines/KidView pages too).
  // CERCLE_KEY too: a member is a person in Le cercle, so a rename/recolour/delete
  // must refresh the circle (which reads /api/cercle, not /api/members).
  const load = useCallback(() => {
    for (const key of [MEMBERS_KEY, DEVICES_KEY, CHORES_KEY, ['routines'], EVENTS_KEY, ['health'], BOARD_KEY, CERCLE_KEY]) {
      qc.invalidateQueries({ queryKey: key })
    }
  }, [qc])

  useEffect(() => {
    if (!loading && !canEnter) nav('/login')
  }, [loading, canEnter, nav])

  // Which settings tab is open, held in the URL (?tab=<id>). A deep link selects
  // the matching tab (/settings?tab=routines) and the choice survives a refresh
  // or a return from elsewhere — unlike the old read-only hash. See tabParam.
  // A kiosk can't admin members or pair devices — drop those two tabs and keep
  // them out of the valid tab set so a deep link can't land on them. "Still
  // loading" counts as full access so an operator's deep link (?tab=household)
  // survives the auth round-trip instead of snapping to the default tab.
  const fullAccess = signedIn || loading
  // Guest issuance is operator-only (the server's guest/start is 'operator'
  // scope), so a kiosk never sees that tab either — same as Membres + Tablettes.
  // A kiosk can't admin members or pair devices/issue guest links. Those live in two
  // operator-only tabs now — « La maisonnée » (id 'household': members + cercle) and
  // « Accès & appareils » (id 'devices': tablets + guest) — both dropped wholesale for
  // a kiosk and kept out of the valid set so a deep link can't bypass the gate.
  const sections = fullAccess ? SECTIONS : SECTIONS.filter((s) => s.id !== 'household' && s.id !== 'devices')
  const sectionIds = sections.map((s) => s.id)
  // The valid set also accepts every retired alias id, so an old deep link parses;
  // resolveTab folds an alias to its host (and a host that's hidden on this device —
  // e.g. ?tab=guest on a kiosk — back to the default tab).
  const [rawTab, setTab] = useTabParam('tab', sectionIds[0], [...sectionIds, ...Object.keys(TAB_ALIAS)])
  const aliased = TAB_ALIAS[rawTab] ?? rawTab
  const tab = sectionIds.includes(aliased) ? aliased : sectionIds[0]
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
      tagPills: t.operator.tagPills,
      tagUsed: t.operator.tagUsed,
      shop: t.operator.shopping,
      storeFilter: t.operator.storeFilter,
      history: t.operator.history,
      ghost: t.operator.ghost,
      recipePills: t.operator.pillsTitle,
      recap: t.operator.recapTitle,
      photos: t.operator.photos,
      micTest: t.operator.micTestTitle,
      aiTest: t.operator.aiTestTitle,
      aiLog: t.operator.aiLogTitle,
      ai: t.operator.aiTitle,
      idleDebug: t.operator.debugIdleTitle,
      guest: t.guest.title,
      choreLedger: t.operator.ledgerTitle,
      cercleGroups: t.operator.cercleGroupsTitle,
    }
    return labels[k] ?? k
  }, tab)

  // Within-tab jump chips for the fat tabs (3+ stacked sections). Labels reuse each
  // section's own title key so a chip matches the heading it lands on. ai's last chip
  // (the AI error log) is conditional on AI being on, mirroring its render below.
  const jumpNav: Record<string, { id: string; label: string }[]> = {
    agenda: [
      { id: 'sec-events', label: t.operator.events },
      { id: 'sec-cars', label: t.operator.carsTitle },
      { id: 'sec-schedule', label: t.operator.schedTitle },
    ],
    chores: [
      { id: 'sec-chores', label: t.operator.chores },
      { id: 'sec-routines', label: t.operator.routines },
      { id: 'sec-todos', label: t.todos.templatesTitle },
    ],
    recipes: [
      { id: 'sec-tags', label: t.operator.tagsTitle },
      { id: 'sec-pills', label: t.operator.pillsTitle },
      { id: 'sec-measure', label: t.operator.measureColorsTitle },
      { id: 'sec-meals', label: t.operator.mealColors },
      { id: 'sec-reserve', label: t.operator.reserveTitle },
    ],
    shopping: [
      { id: 'sec-shop', label: t.operator.shopping },
      { id: 'sec-aisles', label: t.operator.aisleOrder },
      { id: 'sec-stores', label: t.operator.storeFilter },
      { id: 'sec-history', label: t.operator.history },
      { id: 'sec-ghost', label: t.operator.ghost },
    ],
    display: [
      { id: 'sec-display', label: t.operator.display },
      { id: 'sec-layout', label: t.operator.boardLayout },
      { id: 'sec-ambient', label: t.operator.ambientTitle },
      { id: 'sec-photos', label: t.operator.photos },
      { id: 'sec-voice', label: t.operator.voiceTitle },
      { id: 'sec-calm', label: t.operator.calmTitle },
    ],
    ai: [
      { id: 'sec-thisweek', label: t.operator.thisWeekTitle },
      { id: 'sec-recap', label: t.operator.recapTitle },
      { id: 'sec-ai', label: t.operator.aiTitle },
      { id: 'sec-build', label: t.operator.buildTitle },
      { id: 'sec-idle', label: t.operator.debugIdleTitle },
      { id: 'sec-mic', label: t.operator.micTestTitle },
      ...(aiEnabled ? [{ id: 'sec-ailog', label: t.operator.aiLogTitle }] : []),
    ],
  }

  if (loading || !canEnter) return <p className="loading mono">{t.common.loading}</p>

  return (
    <main className="operator">
      <div className="operator__head">
        <div>
          <h1>{t.operator.title}</h1>
        </div>
        <div className="operator__meta mono">
          <span>{household?.name}</span>
          {/* The "IA : active" status tag is now the quick on/off switch (the fuller
              control + explanation lives in the IA tab). Binding absent → a plain
              "unavailable" tag, nothing to toggle. */}
          {aiAvailable ? (
            <button
              type="button"
              className={`tag tag--btn ${aiEnabled ? 'tag--on' : 'tag--off'}`}
              onClick={async () => {
                if (aiBusy) return
                setAiBusy(true)
                try {
                  await aiToggle(!aiEnabled)
                } finally {
                  setAiBusy(false)
                }
              }}
              disabled={aiBusy}
              aria-pressed={aiEnabled}
              title={t.operator.aiToggleTitle}
            >
              {aiEnabled ? t.operator.aiOn : t.operator.aiDisabled}
            </button>
          ) : (
            <span className="tag tag--off">{t.operator.aiOff}</span>
          )}
          {signedIn ? (
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => {
                // Drop the picked face with the session — on a shared device the
                // next family signing in must not inherit a ghost member id (the
                // X-Profile header would mis-attribute their writes).
                setMemberId(null)
                signOut().then(() => nav('/'))
              }}
            >
              {t.nav.logout}
            </button>
          ) : (
            // A kiosk has no session to drop; offer the escalation to operator
            // (needed for the two hidden tabs: Membres + Tablettes jumelées).
            <button type="button" className="btn btn--ghost mono" onClick={() => nav('/login')}>
              {t.operator.kioskSignIn}
            </button>
          )}
        </div>
      </div>

      {!signedIn && <p className="operator__kiosk-note mono">{t.operator.kioskNotice}</p>}

      {/* Settings navigation: a sticky vertical sidebar on a wide screen (kiosk/
          desktop, its own scroll region), and a wrapping row of chips on a phone.
          Now just 9 task-oriented tabs (was 21), so no group headers needed — each
          tab is its own role="tab". Deep links resolve through TAB_ALIAS, so every
          old ?tab=<id> still lands on its host tab. */}
      <div className="operator__body">
        <nav
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
          {sections.map((s) => (
            <button
              key={s.id}
              id={`op-tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={tab === s.id}
              aria-controls="operator-panel"
              tabIndex={tab === s.id ? 0 : -1}
              className={`operator__tab${tab === s.id ? ' is-active' : ''}`}
              onClick={() => setTab(s.id)}
            >
              {t.operator[s.key]}
            </button>
          ))}
        </nav>

        <div className="operator__panel" role="tabpanel" id="operator-panel" aria-labelledby={`op-tab-${tab}`} tabIndex={0}>
        {/* Each tab carries its own how-it-works inline (the per-tab cards that
            used to live only under Guide). The Guide tab documents itself. */}
        {tab !== 'guide' && <SectionGuide tab={tab} />}

        {/* Quiet within-tab jump chips for the fat tabs (3+ stacked sections). */}
        {jumpNav[tab] && <OperatorJump items={jumpNav[tab]} ariaLabel={t.operator.jumpAria} />}

        {/* « La maisonnée » — your people: members + the cercle (family/friends)
            groups. Operator-only (the whole tab is dropped for a kiosk). */}
        {tab === 'household' && (
          <>
            <MembersSection members={members} onChange={load} />
            <CercleGroupsSection help={operatorHelp} />
          </>
        )}

        {/* « Accès & appareils » — tablets + guest links. Whole tab is operator-only
            (dropped from `sections` for a kiosk). */}
        {tab === 'devices' && (
          <>
            <ClaimTablet onClaimed={load} />
            <DevicesSection devices={devices} onChange={load} />
            <GuestSection help={operatorHelp} />
          </>
        )}

        {/* « Agenda & auto » — the calendar and the family car/work windows. */}
        {tab === 'agenda' && (
          <>
            <div id="sec-events" className="operator__anchor">
              <EventsSection events={events} members={members} onChange={load} />
            </div>
            <div id="sec-cars" className="operator__anchor">
              <CarsSection help={operatorHelp} />
            </div>
            <div id="sec-schedule" className="operator__anchor">
              <ScheduleSection help={operatorHelp} />
            </div>
          </>
        )}

        {/* « Corvées & routines » — the recurring tasks + checklists. */}
        {tab === 'chores' && (
          <>
            <div id="sec-chores" className="operator__anchor">
              <ChoresTabPanel chores={chores} onChange={load} help={operatorHelp} />
            </div>
            <div id="sec-routines" className="operator__anchor">
              <RoutinesSection routines={routines} onChange={load} />
            </div>
            <div id="sec-todos" className="operator__anchor">
              <TodoTemplatesSection help={operatorHelp} />
            </div>
          </>
        )}

        {/* « La cuisine » — recipes, the measure pills (a recipe feature, moved here
            from Affichage), meal slots, and la réserve. */}
        {tab === 'recipes' && (
          <>
            <div id="sec-tags" className="operator__anchor">
              <RecipeTagsSection help={operatorHelp} />
            </div>
            <div id="sec-pills" className="operator__anchor">
              <RecipePillsSection help={operatorHelp} />
            </div>
            <div id="sec-measure" className="operator__anchor">
              <MeasureColorsSection help={operatorHelp} />
            </div>
            <div id="sec-meals" className="operator__anchor">
              <MealSlotsSection help={operatorHelp} />
            </div>
            <div id="sec-reserve" className="operator__anchor">
              <ReserveLocationsSection help={operatorHelp} />
            </div>
          </>
        )}

        {/* « Magasinage » — the list config, aisles, stores, history + ghost. */}
        {tab === 'shopping' && (
          <>
            <div id="sec-shop" className="operator__anchor">
              <ShopSection help={operatorHelp} />
            </div>
            <div id="sec-aisles" className="operator__anchor">
              <AisleOrderSection />
            </div>
            <div id="sec-stores" className="operator__anchor">
              <StoreFilterSection help={operatorHelp} />
            </div>
            <div id="sec-history" className="operator__anchor">
              <HistorySection help={operatorHelp} />
            </div>
            <div id="sec-ghost" className="operator__anchor">
              <GhostSection help={operatorHelp} />
            </div>
          </>
        )}

        {/* « Le babillard » — how this screen looks & behaves: display, board card
            layout, screensaver, the photo wall (moved here), voice, and calm mode. */}
        {tab === 'display' && (
          <>
            <div id="sec-display" className="operator__anchor">
              <DisplaySection help={operatorHelp} />
            </div>
            <div id="sec-layout" className="operator__anchor">
              <BoardLayoutSection help={operatorHelp} />
            </div>
            <div id="sec-ambient" className="operator__anchor">
              <AmbientSettingsSection help={operatorHelp} />
            </div>
            <div id="sec-photos" className="operator__anchor">
              <PhotosSection help={operatorHelp} />
            </div>
            <div id="sec-voice" className="operator__anchor">
              <VoiceSection help={operatorHelp} />
            </div>
            <div id="sec-calm" className="operator__anchor">
              <CalmSection help={operatorHelp} />
            </div>
          </>
        )}

        {/* « IA & système » — the weekly together-recap (AI-written) leads, then the
            AI on/off + settings, then the diagnostics. */}
        {tab === 'ai' && (
          <>
            <div id="sec-thisweek" className="operator__anchor">
              <ThisWeekTogetherSection help={operatorHelp} />
            </div>
            <div id="sec-recap" className="operator__anchor">
              <RecapSection help={operatorHelp} />
            </div>
            <div id="sec-ai" className="operator__anchor">
              <AiSection help={operatorHelp} />
            </div>
            <div id="sec-build" className="operator__anchor">
              <BuildInfoSection />
            </div>
            <div id="sec-idle" className="operator__anchor">
              <IdleDebugSection help={operatorHelp} />
            </div>
            <div id="sec-mic" className="operator__anchor">
              <MicSelfTest help={operatorHelp} />
            </div>
            {/* The AI error log is an AI feature — hide it when AI is switched off
                (the mic test + idle debug above aren't AI, so they stay). */}
            {aiEnabled && (
              <div id="sec-ailog" className="operator__anchor">
                <AiErrorLogSection help={operatorHelp} />
              </div>
            )}
          </>
        )}

        {tab === 'guide' && <GuideSection />}
        </div>
      </div>
    </main>
  )
}
