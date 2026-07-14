import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useAuth } from '../lib/auth'
import { useTour } from '../lib/tour'
import { useSandbox } from '../lib/demo'
import { useSampleStatus } from '../lib/sample'
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
// In a demo SANDBOX session (lib/demo.ts) the SAME card wears a try-this face:
// the setup checklist would be nonsense there (the household is seeded and
// nobody pairs a tablet to a 24-hour throwaway), so the steps become a short
// tour of things worth actually DOING with the seeded data — each a deep link
// through the existing URL grammar (?plus=, ?edit=1 — see DISCOVERY.md), no
// completion tracking (calm: links, not a checklist to clear). One card either
// way — the sandbox never stacks a second onboarding card on the pile.
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

// Has the visitor put this card away? SampleBanner's sandbox (claim) face asks,
// because the two must never both be on the board: the claim CTA lives INSIDE this
// card while it's up, and the strip takes over once it's gone — so the offer is
// always exactly once on screen, never twice and never zero times.
export function welcomeDismissed(): boolean {
  return read().dismissed
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

const STEPS: { id: 'members' | 'meals' | 'pair'; to: string; icon: IconName }[] = [
  { id: 'members', to: '/settings?tab=cercle&sub=members', icon: 'users-three-bold' },
  { id: 'meals', to: '/settings?tab=kitchen&sub=meals', icon: 'fork-knife-bold' },
  { id: 'pair', to: '/settings?tab=settings&sub=tablets', icon: 'device-tablet-bold' },
]

// The sandbox try-this list — tuned to the SEEDED data, every target a link the
// guide already uses (?plus= opens the ＋ sheet, ?edit=1 the board edit mode), so
// a mouse user gets the same door a touch gesture would (desktop reachability).
const DEMO_STEPS: { id: 'demoCook' | 'demoRoutine' | 'demoListe' | 'demoRearrange' | 'demoMot'; to: string; icon: IconName }[] = [
  { id: 'demoCook', to: '/kitchen', icon: 'cooking-pot-bold' },
  { id: 'demoRoutine', to: '/routines', icon: 'smiley-bold' },
  { id: 'demoListe', to: '/liste?plus=1', icon: 'shopping-bag-bold' },
  { id: 'demoRearrange', to: '/board?edit=1', icon: 'stack-bold' },
  { id: 'demoMot', to: '/board?plus=mot', icon: 'envelope-bold' },
]

export function WelcomeCard({ members }: { members: { id: string }[] }) {
  const t = useT()
  const { audience } = useAudience()
  const { signedIn } = useAuth()
  const sandbox = useSandbox()
  const { start } = useTour()
  const { hasSample, pending: samplePending } = useSampleStatus()
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

  // Operator-only: this is the household SETUP checklist, and every step + link
  // targets Réglages (operator surface). A kiosk (device token, not signed in)
  // can't act on it, and its "pair a tablet" step could never tick there — so it
  // simply doesn't show. The operator sees it on their own signed-in device.
  if (audience === 'toddler' || !signedIn || state.dismissed) return null
  // Onboarding is SEQUENTIAL: while the seeded demo family is still present, the
  // board shows only the explore banner (SampleBanner) — this setup checklist
  // ("add your family") would be noise then, and its member/meal steps read as
  // already-done off the demo rows. It appears once the demo is cleared, on a real
  // empty household. `pending` guards the first paint so it never flashes then hides.
  // EXCEPT in a sandbox: there the seed IS the point, and this card's try-this face
  // is the visitor's guidance (the claim strip above handles "keep it").
  if (!sandbox && (hasSample || samplePending)) return null

  // Every step is data-driven: it ticks only when the real thing exists, so tapping
  // a link and backing out can never false-complete a step (it just won't be done).
  // The sandbox try-this list never ticks — it's invitations, not a checklist.
  const isDone = (id: string) =>
    !sandbox &&
    ((id === 'members' && members.length > 0) ||
      (id === 'meals' && plannedMeals > 0) ||
      (id === 'pair' && pairedDevices > 0))
  if (!sandbox && STEPS.every((s) => isDone(s.id))) return null

  const steps = sandbox ? DEMO_STEPS : STEPS

  const dismiss = () => {
    setState((s) => {
      const next = { ...s, dismissed: true }
      persist(next)
      return next
    })
    // Hand the claim offer over to SampleBanner's strip in the same beat — it lives
    // in a sibling component, so a plain state update would leave the board with no
    // claim CTA at all until the next navigation.
    window.dispatchEvent(new Event('bb:welcome-dismissed'))
  }

  return (
    <aside className="welcome-card" aria-label={t.welcome.title}>
      <div className="welcome-card__head">
        <span className="welcome-card__icon">
          <Icon name="sparkle-bold" size={22} />
        </span>
        <span className="welcome-card__title">{sandbox ? t.welcome.demoTitle : t.welcome.title}</span>
        <button type="button" className="welcome-card__dismiss" onClick={dismiss}>
          <Icon name="x-bold" size={14} />
          <span>{t.welcome.later}</span>
        </button>
      </div>
      <p className="welcome-card__intro">{sandbox ? t.welcome.demoIntro : t.welcome.intro}</p>
      <ol className="welcome-card__steps">
        {steps.map((s) => {
          const done = isDone(s.id)
          return (
            <li key={s.id} className={'welcome-card__step' + (done ? ' is-done' : '')}>
              <Link to={s.to}>
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
      {/* The sandbox's ONE card carries the claim too. The demo board used to open on
          TWO stacked banners — this try-this card AND the claim strip — so a visitor
          who came to SEE the app got a screen and a half of chrome about the demo and
          no board (first-run pass, 2026-07-14). Both messages matter (the 24-hour
          disclosure is an honesty thing), so they share one card: the offer, with its
          expiry, right where the visitor already is. SampleBanner stands down while
          this shows (see its sandbox face). */}
      {sandbox && (
        <div className="welcome-card__claim">
          <p className="welcome-card__claim-hint">{t.claim.bannerHint}</p>
          <Link to="/garder" className="btn btn--primary btn--sm">
            {t.claim.bannerCta}
          </Link>
        </div>
      )}
      <h3 className="welcome-card__discover">{t.welcome.discover}</h3>
      {/* Tiles open the LIVE section now (alive, since a fresh account is seeded),
          not the Guide — discovery by doing. The Guide stays the explanation layer
          (each section's "?" + Réglages ▸ Guide). */}
      <FeatureMap onSelect={(k) => nav(featureMapRoute(k))} label={t.welcome.discover} />
      {/* A VISIBLE way back to the guided tour: skipping it is one tap, and the only
          other recovery is buried in Réglages ▸ Guide. This keeps it a tap away while
          the newcomer is still on the board. */}
      <button type="button" className="welcome-card__replay" onClick={() => start('essentials')}>
        <Icon name="play-bold" size={14} />
        <span>{t.welcome.replayTour}</span>
      </button>
    </aside>
  )
}
