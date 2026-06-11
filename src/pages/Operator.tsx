import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useProfile } from '../lib/profile'
import { DisplaySection, CalmSection } from '../components/operator/display'
import { ShopSection, GhostSection } from '../components/operator/shopping'
import { ClaimTablet, DevicesSection } from '../components/operator/devices'
import { MembersSection } from '../components/operator/household'
import { EventsSection } from '../components/operator/agenda'
import { ChoresSection, RoutinesSection } from '../components/operator/chores'
import { PhotosSection, RecapSection } from '../components/operator/media'
import { RecipeTagsSection } from '../components/operator/recipesTags'
import type { Member, Device, Chore, Routine, EventRow } from '../components/operator/types'

// Réglages is one panel per tab; this list drives the tab strip. Deep links
// (/settings#<id>) select the matching tab. The sections themselves live in
// src/components/operator/* — this page is just the shell: auth gate, queries,
// tab state, and the invalidation fan-out the sections call after a write.
const SECTIONS = [
  { id: 'household', key: 'members' as const },
  { id: 'agenda', key: 'events' as const },
  { id: 'chores', key: 'chores' as const },
  { id: 'routines', key: 'routines' as const },
  { id: 'shopping', key: 'shopping' as const },
  { id: 'recipes', key: 'recipesTab' as const },
  { id: 'ghost', key: 'ghost' as const },
  { id: 'devices', key: 'devices' as const },
  { id: 'photos', key: 'photos' as const },
  { id: 'recap', key: 'recapTitle' as const },
  { id: 'display', key: 'display' as const },
  { id: 'calm', key: 'calmTitle' as const },
]

// Operator hub (phone/laptop, logged in). The control surface that a kiosk is
// NOT allowed to reach: members, device pairing approval + revocation, chores,
// kid routines. Each section is a thin CRUD strip — no dashboards, no metrics,
// nothing to optimize-against (NFR-CALM).
export function Operator() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const { loading, signedIn, household, signOut } = useAuth()
  const { setMemberId } = useProfile()
  const qc = useQueryClient()

  // Only fetch once signed in — a kiosk/anon visitor would 401. Each strip is
  // independent so one failing read never blanks the rest (data?? [] default).
  const membersQ = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: Member[] }>('members'), enabled: signedIn })
  const devicesQ = useQuery({ queryKey: ['devices'], queryFn: () => api<{ devices: Device[] }>('pair/devices'), enabled: signedIn })
  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<{ chores: Chore[] }>('chores'), enabled: signedIn })
  const routinesQ = useQuery({ queryKey: ['routines'], queryFn: () => api<{ routines: Routine[] }>('routines'), enabled: signedIn })
  const eventsQ = useQuery({ queryKey: ['events'], queryFn: () => api<{ events: EventRow[] }>('events'), enabled: signedIn })
  const healthQ = useQuery({ queryKey: ['health'], queryFn: () => api<{ ai: boolean }>('health'), enabled: signedIn })

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
    if (!loading && !signedIn) nav('/login')
  }, [loading, signedIn, nav])

  // Which settings tab is open. A deep link selects the matching tab
  // (/settings#<id>, init + on hash change).
  const [tab, setTab] = useState<string>(() => {
    const h = loc.hash.slice(1)
    return SECTIONS.some((s) => s.id === h) ? h : SECTIONS[0].id
  })
  useEffect(() => {
    const h = loc.hash.slice(1)
    if (h && SECTIONS.some((s) => s.id === h)) setTab(h)
  }, [loc.hash])

  if (loading || !signedIn) return <p className="loading mono">{t.common.loading}</p>

  return (
    <main className="operator">
      <div className="operator__head">
        <div>
          <div className="hand-tag">{t.appName}</div>
          <h1>{t.operator.title}</h1>
        </div>
        <div className="operator__meta mono">
          <span>{household?.name}</span>
          <span className={`tag ${ai ? 'tag--on' : 'tag--off'}`}>{ai ? t.operator.aiOn : t.operator.aiOff}</span>
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
        </div>
      </div>

      <nav className="operator__tabs mono" role="tablist" aria-label={t.operator.sections}>
        {SECTIONS.map((s) => (
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
        {tab === 'household' && <MembersSection members={members} onChange={load} />}
        {tab === 'agenda' && <EventsSection events={events} members={members} onChange={load} />}
        {tab === 'chores' && <ChoresSection chores={chores} members={members} onChange={load} />}
        {tab === 'routines' && <RoutinesSection routines={routines} members={members} onChange={load} />}
        {tab === 'shopping' && <ShopSection />}
        {tab === 'recipes' && <RecipeTagsSection />}
        {tab === 'ghost' && <GhostSection />}
        {tab === 'devices' && (
          <>
            <ClaimTablet onClaimed={load} />
            <DevicesSection devices={devices} onChange={load} />
          </>
        )}
        {tab === 'photos' && <PhotosSection />}
        {tab === 'recap' && <RecapSection />}
        {tab === 'display' && <DisplaySection />}
        {tab === 'calm' && <CalmSection />}
      </div>
    </main>
  )
}
