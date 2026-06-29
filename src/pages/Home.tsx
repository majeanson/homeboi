import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { Icon, type IconName } from '../components/Icon'
import { useT } from '../i18n'

// The marketing front door — shown to first-time visitors only (the `/` smart
// entry in router.tsx redirects a returning kiosk/phone straight to its home).
// Deliberately a simple, calm SKELETON: a plain-language hero anyone (a grandpa
// handed the link) can read, a small "what it's for" icon strip, and a short
// honest promise. Pip design throughout (Phosphor icons, paper tones). No
// floating CTA, no shadow lifts, no hype — the app's calm tenet starts here.

// "Everything it does", grouped by theme — the SAME taxonomy as the in-app Guide
// (Réglages ▸ Comment ça marche), so the marketing front door and the manual tell
// one story, not two. Each card: a pip glyph + accent, a title, a concrete line.
const FEATURES: {
  icon: IconName
  title: 'featSupper' | 'featAgenda' | 'featRoutines' | 'featCercle' | 'featTablet'
  body: 'featSupperBody' | 'featAgendaBody' | 'featRoutinesBody' | 'featCercleBody' | 'featTabletBody'
  tint: string
  wash: string
}[] = [
  { icon: 'fork-knife-bold', title: 'featSupper', body: 'featSupperBody', tint: 'var(--terracotta-deep)', wash: 'var(--terracotta-wash)' },
  { icon: 'calendar-dots-bold', title: 'featAgenda', body: 'featAgendaBody', tint: 'var(--marigold-deep)', wash: 'var(--marigold-wash)' },
  { icon: 'smiley-bold', title: 'featRoutines', body: 'featRoutinesBody', tint: 'var(--berry-deep)', wash: 'var(--berry-wash)' },
  { icon: 'users-three-bold', title: 'featCercle', body: 'featCercleBody', tint: 'var(--sky-deep)', wash: 'var(--sky-wash)' },
  { icon: 'device-tablet-bold', title: 'featTablet', body: 'featTabletBody', tint: 'var(--sage-deep)', wash: 'var(--sage-wash)' },
]

// The calm promise, in four short lines — the honest "what it won't do".
const PROMISES = ['promise1', 'promise2', 'promise3', 'promise4'] as const

export function Home() {
  const t = useT()
  return (
    <div className="page">
      <TopBar />
      <main className="home">
        <section className="home__hero">
          <p className="home__wordmark">
            <Icon name="sun-bold" size={24} color="var(--marigold-deep)" />
            {t.appName}
          </p>
          <h1 className="home__title">{t.home.title}</h1>
          <p className="home__lead">{t.home.lead}</p>
          <div className="home__cta">
            {/* A first-time family has NO account yet, so the PRIMARY path creates
                the household (→ /signup). Routing them to /setup → /login first was
                a dead-end (nothing to log into). The role gets set on signup. */}
            <Link to="/signup" className="btn btn--primary">
              {t.home.ctaSignup}
            </Link>
            {/* Returning user / setting up a second device: the device-role fork
                (→ /setup → login or pair) stays one tap away as the secondary. Labelled
                "J'ai déjà un compte" so it reads as the path for someone who's NOT new,
                rather than a second "start" competing with the primary create CTA. */}
            <Link to="/setup" className="btn btn--ghost">
              {t.home.ctaReturning}
            </Link>
          </div>
        </section>

        {/* Everything it does — themed feature cards (same taxonomy as the Guide),
            so a first visitor sees the app's real range, not six bare labels. */}
        <section className="home__block">
          <h2 className="home__h mono">{t.home.featHeading}</h2>
          <ul className="home__features">
            {FEATURES.map((f) => (
              <li key={f.title} className="home__feature">
                <span className="home__feature-ic" style={{ background: f.wash, color: f.tint }}>
                  <Icon name={f.icon} size={24} />
                </span>
                <span className="home__feature-text">
                  <span className="home__feature-title">{t.home[f.title]}</span>
                  <span className="home__feature-body">{t.home[f.body]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* The calm promise — the honest "what it won't do", then privacy. */}
        <section className="home__block">
          <h2 className="home__h mono">{t.home.promiseHeading}</h2>
          <ul className="home__promises">
            {PROMISES.map((p) => (
              <li key={p} className="home__promise-row">
                <Icon name="check-bold" size={18} color="var(--sage-deep)" />
                <span>{t.home[p]}</span>
              </li>
            ))}
          </ul>
          <p className="home__privacy">{t.home.privacyLine}</p>
        </section>
      </main>
    </div>
  )
}
