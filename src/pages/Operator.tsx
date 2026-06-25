import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAi, useAiToggle } from '../lib/ai'
import { isPaired } from '../lib/device'
import { useProfile } from '../lib/profile'
import { DisplaySection, VoiceSection, CalmSection, MeasureColorsSection, CastTvSection } from '../components/operator/display'
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
import { useHelpMode } from '../lib/helpMode'
import { OPERATOR_HELP } from '../lib/operatorHelp'
import { useTabParam } from '../lib/tabParam'
import type { Member, Device, Chore, Routine, EventRow } from '../components/operator/types'

// Réglages is one panel per tab; this list drives the tab strip. Deep links
// (/settings?tab=<id>) select the matching tab — the active tab lives in the URL
// (see lib/tabParam). The sections themselves live in src/components/operator/* —
// this page is just the shell: auth gate, queries, tab state, and the
// invalidation fan-out the sections call after a write.
const SECTIONS = [
  { id: 'guide', key: 'guide' as const },
  { id: 'household', key: 'members' as const },
  { id: 'cercle', key: 'cercleTab' as const },
  { id: 'agenda', key: 'events' as const },
  { id: 'auto', key: 'autoTab' as const },
  { id: 'chores', key: 'chores' as const },
  { id: 'routines', key: 'routines' as const },
  { id: 'todos', key: 'todosTab' as const },
  { id: 'shopping', key: 'shopping' as const },
  { id: 'recipes', key: 'recipesTab' as const },
  { id: 'meals', key: 'mealsTab' as const },
  { id: 'reserve', key: 'reserveTab' as const },
  { id: 'ghost', key: 'ghost' as const },
  { id: 'devices', key: 'devices' as const },
  { id: 'guest', key: 'guestTab' as const },
  { id: 'photos', key: 'photos' as const },
  { id: 'week', key: 'thisWeekTab' as const },
  { id: 'display', key: 'display' as const },
  { id: 'calm', key: 'calmTitle' as const },
  { id: 'ai', key: 'aiTab' as const },
  { id: 'ai-log', key: 'aiLog' as const },
]
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
  const membersQ = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: Member[] }>('members'), enabled: canEnter })
  const devicesQ = useQuery({ queryKey: ['devices'], queryFn: () => api<{ devices: Device[] }>('pair/devices'), enabled: signedIn })
  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<{ chores: Chore[] }>('chores'), enabled: canEnter })
  const routinesQ = useQuery({ queryKey: ['routines'], queryFn: () => api<{ routines: Routine[] }>('routines'), enabled: canEnter })
  const eventsQ = useQuery({ queryKey: ['events'], queryFn: () => api<{ events: EventRow[] }>('events'), enabled: canEnter })

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
  const load = useCallback(() => {
    for (const key of [['members'], ['devices'], ['chores'], ['routines'], ['events'], ['health'], ['board']]) {
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
  const sections = fullAccess
    ? SECTIONS
    : SECTIONS.filter((s) => s.id !== 'household' && s.id !== 'devices' && s.id !== 'guest')
  const [tab, setTab] = useTabParam(
    'tab',
    sections[0].id,
    sections.map((s) => s.id),
  )
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

      <nav className="operator__tabs mono" role="tablist" aria-label={t.operator.sections}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={tab === s.id}
            className={`operator__tab${tab === s.id ? ' is-active' : ''}`}
            onClick={() => setTab(s.id)}
          >
            {t.operator[s.key]}
          </button>
        ))}
      </nav>

      <div className="operator__panel" role="tabpanel">
        {/* Each tab carries its own how-it-works inline (the per-tab cards that
            used to live only under Guide). The Guide tab documents itself. */}
        {tab !== 'guide' && <SectionGuide tab={tab} />}
        {tab === 'household' && <MembersSection members={members} onChange={load} />}
        {tab === 'cercle' && <CercleGroupsSection help={operatorHelp} />}
        {tab === 'agenda' && <EventsSection events={events} members={members} onChange={load} />}
        {tab === 'chores' && <ChoresTabPanel chores={chores} onChange={load} help={operatorHelp} />}
        {tab === 'routines' && <RoutinesSection routines={routines} onChange={load} />}
        {tab === 'todos' && <TodoTemplatesSection help={operatorHelp} />}
        {tab === 'shopping' && (
          <>
            <ShopSection help={operatorHelp} />
            <AisleOrderSection />
            <StoreFilterSection help={operatorHelp} />
            <HistorySection help={operatorHelp} />
          </>
        )}
        {tab === 'recipes' && (
          <>
            <RecipeTagsSection help={operatorHelp} />
            <RecipePillsSection help={operatorHelp} />
          </>
        )}
        {tab === 'meals' && <MealSlotsSection help={operatorHelp} />}
        {tab === 'reserve' && <ReserveLocationsSection help={operatorHelp} />}
        {tab === 'auto' && (
          <>
            <CarsSection help={operatorHelp} />
            <ScheduleSection help={operatorHelp} />
          </>
        )}
        {tab === 'ghost' && <GhostSection help={operatorHelp} />}
        {tab === 'devices' && (
          <>
            <ClaimTablet onClaimed={load} />
            <DevicesSection devices={devices} onChange={load} />
          </>
        )}
        {tab === 'guest' && <GuestSection help={operatorHelp} />}
        {tab === 'photos' && <PhotosSection help={operatorHelp} />}
        {/* "Cette semaine ensemble" — the weekly ritual; the AI 2-liner recap folds
            in below it so the reflection lives in one place. */}
        {tab === 'week' && (
          <>
            <ThisWeekTogetherSection help={operatorHelp} />
            <RecapSection help={operatorHelp} />
          </>
        )}
        {tab === 'display' && (
          <>
            <DisplaySection help={operatorHelp} />
            <BoardLayoutSection help={operatorHelp} />
            <AmbientSettingsSection help={operatorHelp} />
            <CastTvSection help={operatorHelp} />
            <MeasureColorsSection help={operatorHelp} />
            <VoiceSection help={operatorHelp} />
          </>
        )}
        {tab === 'calm' && <CalmSection help={operatorHelp} />}
        {tab === 'ai' && <AiSection help={operatorHelp} />}
        {tab === 'ai-log' && (
          <>
            <BuildInfoSection />
            <IdleDebugSection help={operatorHelp} />
            <MicSelfTest help={operatorHelp} />
            {/* The AI error log is an AI feature — hide it when AI is switched off
                (the mic test + idle debug above aren't AI, so they stay). */}
            {aiEnabled && <AiErrorLogSection help={operatorHelp} />}
          </>
        )}
        {tab === 'guide' && <GuideSection />}
      </div>
    </main>
  )
}
