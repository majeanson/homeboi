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

// "What it's for", in concrete household terms, each with its pip glyph + accent.
const SECTIONS: { icon: IconName; key: 'forSupper' | 'forList' | 'forRoutines' | 'forChores' | 'forAgenda'; tint: string; wash: string }[] = [
  { icon: 'fork-knife-bold', key: 'forSupper', tint: 'var(--terracotta-deep)', wash: 'var(--terracotta-wash)' },
  { icon: 'sparkle-bold', key: 'forList', tint: 'var(--sky-deep)', wash: 'var(--sky-wash)' },
  { icon: 'smiley-bold', key: 'forRoutines', tint: 'var(--berry-deep)', wash: 'var(--berry-wash)' },
  { icon: 'broom-bold', key: 'forChores', tint: 'var(--sage-deep)', wash: 'var(--sage-wash)' },
  { icon: 'calendar-dots-bold', key: 'forAgenda', tint: 'var(--marigold-deep)', wash: 'var(--marigold-wash)' },
]

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
            <Link to="/setup" className="btn btn--primary">
              {t.home.ctaStart}
            </Link>
            {/* The new-family shortcut: skip the device-role fork and go straight
                to creating the household (the role gets set on signup anyway). */}
            <Link to="/signup" className="btn btn--ghost">
              {t.home.ctaSignup}
            </Link>
          </div>
        </section>

        {/* What it's for — five plain household things, as calm placeholder tiles. */}
        <section className="home__block">
          <h2 className="home__h mono">{t.home.whatHeading}</h2>
          <ul className="home__sections">
            {SECTIONS.map((s) => (
              <li key={s.key} className="home__section">
                <span className="home__section-ic" style={{ background: s.wash, color: s.tint }}>
                  <Icon name={s.icon} size={24} />
                </span>
                <span className="home__section-label">{t.home[s.key]}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
