import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isPaired } from '../lib/device'
import { useProfile } from '../lib/profile'
import { DisplaySection, VoiceSection, CalmSection } from '../components/operator/display'
import { ShopSection, StoreFilterSection, HistorySection, GhostSection } from '../components/operator/shopping'
import { ClaimTablet, DevicesSection } from '../components/operator/devices'
import { MembersSection } from '../components/operator/household'
import { GuestSection } from '../components/operator/guest'
import { EventsSection } from '../components/operator/agenda'
import { ChoresSection, RoutinesSection } from '../components/operator/chores'
import { ChoreLedger } from '../components/ChoreLedger'
import { PhotosSection, RecapSection } from '../components/operator/media'
import { RecipeTagsSection } from '../components/operator/recipesTags'
import { MealSlotsSection } from '../components/operator/meals'
import { ReserveLocationsSection } from '../components/operator/reserve'
import { AiErrorLogSection } from '../components/operator/aiErrors'
import { MicSelfTest } from '../components/operator/micTest'
import { GuideSection } from '../components/operator/guide'
import { SectionGuide } from '../components/operator/sectionGuide'
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
  { id: 'agenda', key: 'events' as const },
  { id: 'chores', key: 'chores' as const },
  { id: 'routines', key: 'routines' as const },
  { id: 'shopping', key: 'shopping' as const },
  { id: 'recipes', key: 'recipesTab' as const },
  { id: 'meals', key: 'mealsTab' as const },
  { id: 'reserve', key: 'reserveTab' as const },
  { id: 'ghost', key: 'ghost' as const },
  { id: 'devices', key: 'devices' as const },
  { id: 'guest', key: 'guestTab' as const },
  { id: 'photos', key: 'photos' as const },
  { id: 'recap', key: 'recapTitle' as const },
  { id: 'display', key: 'display' as const },
  { id: 'calm', key: 'calmTitle' as const },
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
  const healthQ = useQuery({ queryKey: ['health'], queryFn: () => api<{ ai: boolean }>('health'), enabled: canEnter })

  const members = membersQ.data?.members ?? []
  const devices = devicesQ.data?.devices ?? []
  const chores = choresQ.data?.chores ?? []
  const routines = routinesQ.data?.routines ?? []
  const events = eventsQ.data?.events ?? []
  const ai = healthQ.data?.ai ?? null

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

  if (loading || !canEnter) return <p className="loading mono">{t.common.loading}</p>

  return (
    <main className="operator">
      <div className="operator__head">
        <div>
          <h1>{t.operator.title}</h1>
        </div>
        <div className="operator__meta mono">
          <span>{household?.name}</span>
          <span className={`tag ${ai ? 'tag--on' : 'tag--off'}`}>{ai ? t.operator.aiOn : t.operator.aiOff}</span>
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
        {tab === 'agenda' && <EventsSection events={events} members={members} onChange={load} />}
        {tab === 'chores' && (
          <>
            <ChoresSection chores={chores} onChange={load} />
            <ChoreLedger />
          </>
        )}
        {tab === 'routines' && <RoutinesSection routines={routines} onChange={load} />}
        {tab === 'shopping' && (
          <>
            <ShopSection />
            <StoreFilterSection />
            <HistorySection />
          </>
        )}
        {tab === 'recipes' && <RecipeTagsSection />}
        {tab === 'meals' && <MealSlotsSection />}
        {tab === 'reserve' && <ReserveLocationsSection />}
        {tab === 'ghost' && <GhostSection />}
        {tab === 'devices' && (
          <>
            <ClaimTablet onClaimed={load} />
            <DevicesSection devices={devices} onChange={load} />
          </>
        )}
        {tab === 'guest' && <GuestSection />}
        {tab === 'photos' && <PhotosSection />}
        {tab === 'recap' && <RecapSection />}
        {tab === 'display' && (
          <>
            <DisplaySection />
            <VoiceSection />
          </>
        )}
        {tab === 'calm' && <CalmSection />}
        {tab === 'ai-log' && (
          <>
            <MicSelfTest />
            <AiErrorLogSection />
          </>
        )}
        {tab === 'guide' && <GuideSection />}
      </div>
    </main>
  )
}
