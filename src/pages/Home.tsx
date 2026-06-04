import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'
import { useAuth } from '../lib/auth'

// The marketing front door. Calm by design: no floating CTA, no shadow lifts,
// the value props sit flat on the page. Three honest claims (calm / kid /
// privacy), each its own length so it doesn't read as a parallel triad.
export function Home() {
  const t = useT()
  const { signedIn } = useAuth()
  return (
    <div className="page">
      <TopBar />
      <main className="home">
        <section className="home__hero">
          <p className="eyebrow mono">{t.home.eyebrow}</p>
          <h1 className="home__title">{t.home.title}</h1>
          <p className="home__lead">{t.home.lead}</p>
          <div className="home__cta">
            <Link to={signedIn ? '/settings' : '/login'} className="btn btn--primary">
              {t.home.ctaLogin}
            </Link>
            <Link to="/pair" className="btn">
              {t.home.ctaPair}
            </Link>
          </div>
        </section>

        <section className="home__values">
          <article className="surface home__value">
            <h2>{t.home.calmTitle}</h2>
            <p>{t.home.calmBody}</p>
          </article>
          <article className="surface home__value">
            <h2>{t.home.kidTitle}</h2>
            <p>{t.home.kidBody}</p>
          </article>
          <article className="surface home__value">
            <h2>{t.home.privacyTitle}</h2>
            <p>{t.home.privacyBody}</p>
          </article>
        </section>

        <nav className="home__links mono">
          <Link to="/board">→ {t.nav.board}</Link>
          <Link to="/kitchen">→ {t.nav.kitchen}</Link>
          <Link to="/kid">→ {t.nav.kid}</Link>
        </nav>
      </main>
    </div>
  )
}
