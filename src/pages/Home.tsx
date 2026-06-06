import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useT } from '../i18n'

// The marketing front door — shown to first-time visitors only (the `/` smart
// entry in router.tsx redirects a returning kiosk/phone straight to its home).
// Calm by design: no floating CTA, no shadow lifts, the value props sit flat on
// the page. Three honest claims (calm / kid / privacy), each its own length so it
// doesn't read as a parallel triad. ONE CTA — "Get started" → /setup, where the
// visitor says whether this is a wall display or a personal device.
export function Home() {
  const t = useT()
  return (
    <div className="page">
      <TopBar />
      <main className="home">
        <section className="home__hero">
          <p className="eyebrow mono">{t.home.eyebrow}</p>
          <h1 className="home__title">{t.home.title}</h1>
          <p className="home__lead">{t.home.lead}</p>
          <div className="home__cta">
            <Link to="/setup" className="btn btn--primary">
              {t.home.ctaStart}
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
      </main>
    </div>
  )
}
