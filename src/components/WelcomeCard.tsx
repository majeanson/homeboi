import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { Icon, type IconName } from './Icon'
import { FeatureMap } from './FeatureMap'

// The Board first-run card for a brand-new household: a short setup checklist
// (add the family → set the meals → pair a tablet) plus the shared FeatureMap so
// a newcomer can also see — and jump into — everything the app does. Calm by
// design: dismissible ("Plus tard"), auto-hides once every step is done, never
// shown in the toddler lens. Replaces the old one-line "add your family" hint.
//
// Persistence mirrors SectionIntro's shape: one localStorage key holds {dismissed,
// done[]} so we never nag again. "add the family" auto-completes from the live
// member list; the other two check off when the parent taps through to do them.
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
  const nav = useNavigate()
  const [state, setState] = useState(read)

  if (audience === 'toddler' || state.dismissed) return null

  // "add the family" auto-checks from live data; the rest check on tap-through.
  const isDone = (id: string) => state.done.includes(id) || (id === 'members' && members.length > 0)
  if (STEPS.every((s) => isDone(s.id))) return null

  const markDone = (id: string) =>
    setState((s) => {
      const next = { ...s, done: s.done.includes(id) ? s.done : [...s.done, id] }
      persist(next)
      return next
    })
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
              <Link to={`/settings?tab=${s.tab}`} onClick={() => markDone(s.id)}>
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
      <FeatureMap onSelect={(k) => nav(`/settings?tab=guide&theme=${k}`)} label={t.welcome.discover} />
    </aside>
  )
}
