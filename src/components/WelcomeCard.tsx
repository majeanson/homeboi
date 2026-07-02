import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { useMeals } from '../lib/queryHooks'
import { DEVICES_KEY } from '../lib/queryKeys'
import { Icon, type IconName } from './Icon'
import { FeatureMap } from './FeatureMap'
import { featureMapRoute } from '../lib/guideContent'

// The Board first-run card for a brand-new household: a short setup checklist
// (add the family → set the meals → pair a tablet) plus the shared FeatureMap so
// a newcomer can also see — and jump into — everything the app does. Calm by
// design: dismissible ("Plus tard"), auto-hides once every step is done, never
// shown in the toddler lens. Replaces the old one-line "add your family" hint.
//
// Persistence mirrors SectionIntro's shape: one localStorage key holds {dismissed,
// done[]} so the card never nags once it's been dismissed. Every STEP, though, is
// DATA-DRIVEN — a step ticks only when the underlying thing actually exists (a
// member, a planned meal, a paired tablet), never just because the parent tapped
// the link and bounced. (`done[]` survives only for the dismissed-record shape.)
const KEY = 'babillard-welcome'
type State = { dismissed: boolean; done: string[] }

function read(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<State>
      return { dismissed: !!v.dismissed, done: Array.isArray(v.done) ? v.done.filter((x): x is string => typeof x === 'string') : [] }
    }
  } catch {
    /* noop */
  }
  return { dismissed: false, done: [] }
}
function persist(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* noop */
  }
}

// Bring the first-run checklist back (Réglages ▸ Guide ▸ Première fois ▸ « Revoir
// l'accueil »): drop the dismissed/done record so the card shows again. It re-reads
// localStorage on its next mount, so the caller navigates to /board afterwards.
export function resetWelcome(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

const STEPS: { id: 'members' | 'meals' | 'pair'; tab: string; icon: IconName }[] = [
  { id: 'members', tab: 'household', icon: 'users-three-bold' },
  { id: 'meals', tab: 'meals', icon: 'fork-knife-bold' },
  { id: 'pair', tab: 'devices', icon: 'device-tablet-bold' },
]

export function WelcomeCard({ members }: { members: { id: string }[] }) {
  const t = useT()
  const { audience } = useAudience()
  const { signedIn } = useAuth()
  const nav = useNavigate()
  const [state, setState] = useState(read)

  // Real-progress sources (reuse the shared hook + key — no new endpoints):
  // • meals: the planned-meal week (≥1 planned meal ⇒ "choose the meals" is done).
  // • pair: the operator's paired-device list. Operator-scoped, so it's gated to a
  //   signed-in session; on a kiosk (no session) it stays unfetched and the step
  //   simply waits — it can only be done from operator Réglages anyway.
  const plannedMeals = useMeals().data?.days.length ?? 0
  const pairedDevices =
    useQuery({
      queryKey: DEVICES_KEY,
      queryFn: () => api<{ devices: { id: string }[] }>('pair/devices'),
      enabled: signedIn,
    }).data?.devices.length ?? 0

  if (audience === 'toddler' || state.dismissed) return null

  // Every step is data-driven: it ticks only when the real thing exists, so tapping
  // a link and backing out can never false-complete a step (it just won't be done).
  const isDone = (id: string) =>
    (id === 'members' && members.length > 0) ||
    (id === 'meals' && plannedMeals > 0) ||
    (id === 'pair' && pairedDevices > 0)
  if (STEPS.every((s) => isDone(s.id))) return null

  const dismiss = () =>
    setState((s) => {
      const next = { ...s, dismissed: true }
      persist(next)
      return next
    })

  return (
    <aside className="welcome-card" aria-label={t.welcome.title}>
      <div className="welcome-card__head">
        <span className="welcome-card__icon">
          <Icon name="sparkle-bold" size={22} />
        </span>
        <span className="welcome-card__title">{t.welcome.title}</span>
        <button type="button" className="welcome-card__dismiss" onClick={dismiss}>
          <Icon name="x-bold" size={14} />
          <span>{t.welcome.later}</span>
        </button>
      </div>
      <p className="welcome-card__intro">{t.welcome.intro}</p>
      <ol className="welcome-card__steps">
        {STEPS.map((s) => {
          const done = isDone(s.id)
          return (
            <li key={s.id} className={'welcome-card__step' + (done ? ' is-done' : '')}>
              <Link to={`/settings?tab=${s.tab}`}>
                <span className="welcome-card__step-ic">
                  <Icon name={done ? 'check-bold' : s.icon} size={18} />
                </span>
                <span className="welcome-card__step-label">{t.welcome[s.id]}</span>
                {!done && <Icon name="arrow-right-bold" size={16} />}
              </Link>
            </li>
          )
        })}
      </ol>
      <h3 className="welcome-card__discover">{t.welcome.discover}</h3>
      {/* Tiles open the LIVE section now (alive, since a fresh account is seeded),
          not the Guide — discovery by doing. The Guide stays the explanation layer
          (each section's "?" + Réglages ▸ Guide). */}
      <FeatureMap onSelect={(k) => nav(featureMapRoute(k))} label={t.welcome.discover} />
    </aside>
  )
}
