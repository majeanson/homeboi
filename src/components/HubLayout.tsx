import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { toggleTheme } from '../lib/theme'
import { useAudience } from '../lib/audience'

// The hub shell. Owns the chrome ONCE (brand, theme, lang), a tab bar of themes,
// and the global Parent/Toddler switch. Each themed tab renders itself for the
// current audience off the same data. Réglages is parent-only, so the audience
// switch hides there (a toddler can't wander into settings/billing — PRD C5).
const TABS = [
  { to: '/board', key: 'today' as const },
  { to: '/kitchen', key: 'kitchen' as const },
  { to: '/routines', key: 'routines' as const },
  { to: '/liste', key: 'list' as const },
  { to: '/settings', key: 'operator' as const },
]

export function HubLayout() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { audience, setAudience } = useAudience()
  const [, force] = useState(0)
  const loc = useLocation()
  const isSettings = loc.pathname.startsWith('/settings')

  return (
    <div className="page hub" data-audience={audience}>
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          {t.appName}
        </Link>
        <div className="topbar__actions">
          {!isSettings && (
            <div className="audience-switch mono" role="group" aria-label={t.audience.parent + ' / ' + t.audience.kid}>
              <button
                type="button"
                className={`audience-switch__opt${audience === 'parent' ? ' is-active' : ''}`}
                onClick={() => setAudience('parent')}
                aria-pressed={audience === 'parent'}
              >
                🧑 {t.audience.parent}
              </button>
              <button
                type="button"
                className={`audience-switch__opt${audience === 'toddler' ? ' is-active' : ''}`}
                onClick={() => setAudience('toddler')}
                aria-pressed={audience === 'toddler'}
              >
                👶 {t.audience.kid}
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              toggleTheme()
              force((n) => n + 1)
            }}
            aria-label={t.common.theme}
          >
            ◐
          </button>
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          >
            {t.common.lang}
          </button>
        </div>
      </header>

      <nav className="tabbar mono" aria-label="sections">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `tabbar__tab${isActive ? ' is-active' : ''}`}
          >
            {t.nav[tab.key]}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
