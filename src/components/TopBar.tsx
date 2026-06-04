import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { toggleTheme } from '../lib/theme'
import { useState } from 'react'

// Minimal chrome: brand, day/night, FR/EN. Kept tiny so the kiosk surfaces
// stay calm. No badges, no counters.
export function TopBar({ children }: { children?: React.ReactNode }) {
  const t = useT()
  const { lang, setLang } = useLang()
  const [, force] = useState(0)
  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand">
        {t.appName}
      </Link>
      <div className="topbar__actions">
        {children}
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
  )
}
