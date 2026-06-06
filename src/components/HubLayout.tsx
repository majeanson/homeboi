import { useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { Icon, type IconName } from './Icon'
import { AddSheet } from './AddSheet'

// The hub shell. No top header anymore (theme/lang/view moved into Réglages):
// just a vertical column of big section buttons, the page body, and a small
// corner gear that deep-links to this page's settings section. Réglages itself
// isn't a column button — it's reached by the gear (and hidden on a locked
// toddler kiosk).
const TABS: {
  to: string
  key: 'today' | 'kitchen' | 'routines' | 'list' | 'operator'
  icon: IconName
  color: string
}[] = [
  { to: '/board', key: 'today', icon: 'sun-bold', color: '#D9842A' }, // marigold
  { to: '/kitchen', key: 'kitchen', icon: 'carrot-bold', color: '#C2563A' }, // terracotta
  { to: '/routines', key: 'routines', icon: 'smiley-bold', color: '#95527A' }, // berry
  { to: '/liste', key: 'list', icon: 'sparkle-bold', color: '#5891AC' }, // sky
  { to: '/settings', key: 'operator', icon: 'gear-six-bold', color: '#6B8A52' }, // sage
]

// Which Réglages section each page's gear jumps to.
const GEAR_SECTION: Record<string, string> = {
  '/board': 'household',
  '/kitchen': 'household',
  '/routines': 'routines',
  '/liste': 'household',
}

export function HubLayout() {
  const t = useT()
  const { audience, locked } = useAudience()
  const loc = useLocation()
  const [addOpen, setAddOpen] = useState(false)
  const isSettings = loc.pathname.startsWith('/settings')

  // A locked toddler kiosk has no business in Réglages.
  if (locked && isSettings) return <Navigate to="/board" replace />

  const path = '/' + (loc.pathname.split('/')[1] || 'board')
  const gearSection = GEAR_SECTION[path] ?? ''
  // The gear is the only route into Réglages; never show it on a locked kiosk
  // (a toddler can't wander into settings/billing — PRD C5) or on the page itself.
  const showGear = !locked && !isSettings
  // Capture is a parent action (the ＋ Add sheet). Not for a toddler, not in settings.
  const showAdd = !locked && !isSettings && audience === 'parent'
  // Réglages is a normal section button — EXCEPT on a locked toddler kiosk,
  // where a three-year-old must not reach settings/billing (PRD C5).
  const tabs = locked ? TABS.filter((tab) => tab.to !== '/settings') : TABS

  return (
    <div className="page hub" data-audience={audience}>
      <nav className="hubnav" aria-label="sections">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `hubnav__btn${isActive ? ' is-active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} size={22} color={isActive ? 'var(--accent-ink)' : tab.color} />
                <span>{t.nav[tab.key]}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="hub__body">
        <Outlet />
      </div>

      {showGear && (
        <Link
          className="page-gear"
          to={`/settings${gearSection ? '#' + gearSection : ''}`}
          aria-label={t.operator.gearLabel}
        >
          <Icon name="gear-six-bold" size={24} />
        </Link>
      )}

      {showAdd && (
        <button type="button" className="add-fab" onClick={() => setAddOpen(true)} aria-label={t.capture.add}>
          <Icon name="plus-bold" size={26} />
        </button>
      )}
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
