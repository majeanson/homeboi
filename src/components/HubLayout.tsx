import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { Icon, type IconName } from './Icon'
import { AddSheet } from './AddSheet'
import { AddSheetContext } from '../lib/addSheet'

// The hub shell, surface-aware. KIOSK (wall display): a vertical column of big
// section buttons down the left, calm and readable across the room. MOBILE
// (phone): the same sections become a thumb-reach bottom tab bar, with the ＋
// quick-add lifted above it. Réglages is the last section button (parent view
// only). The nav also carries the Parent/Enfant switch — flip to preview what
// the toddler sees on any tab, flip back the same way. Nothing floats over the
// page except the single ＋ (parent view only).
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

export function HubLayout() {
  const t = useT()
  const { audience, setAudience, locked } = useAudience()
  const { surface } = useSurface()
  const loc = useLocation()
  const [addOpen, setAddOpen] = useState(false)
  const isSettings = loc.pathname.startsWith('/settings')

  // A locked toddler kiosk has no business in Réglages.
  if (locked && isSettings) return <Navigate to="/board" replace />

  const path = '/' + (loc.pathname.split('/')[1] || 'board')
  const toddler = audience === 'toddler'
  // Capture is a parent action (the ＋ Add sheet). Not for a toddler, not in
  // settings. On the MOBILE board the quick-capture bar already sits at the top
  // of the page, so the floating ＋ would be redundant there — hide it (it stays
  // on every other mobile tab and on the kiosk).
  const onBoard = path === '/board'
  const showAdd = !locked && !isSettings && !toddler && !(surface === 'mobile' && onBoard)
  // Réglages hides from the nav whenever the toddler lens is up: on a locked
  // kiosk a three-year-old must not reach settings/billing (PRD C5), and even
  // unlocked, a kid-facing screen shouldn't dangle a gear — a parent flips back
  // to the parent view first (the switch below), then Réglages reappears.
  const tabs = locked || toddler ? TABS.filter((tab) => tab.to !== '/settings') : TABS

  return (
    <AddSheetContext.Provider value={{ open: () => setAddOpen(true) }}>
    <div className="page hub" data-audience={audience} data-surface={surface}>
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

        {/* Parent ⇄ Enfant, right in the nav (never floating). A parent previews
            the toddler lens on any tab and flips back the same way. NEVER shown
            on a locked kiosk (?kid=1) — there, only relaunching without the
            param unlocks (a deliberate adult act, PRD C5). */}
        {!locked && (
          <button
            type="button"
            className="hubnav__btn hubnav__peek"
            onClick={() => setAudience(toddler ? 'parent' : 'toddler')}
            aria-pressed={toddler}
            aria-label={toddler ? t.audience.parentView : t.audience.kidView}
          >
            <span className="hubnav__peek-pic" aria-hidden="true">{toddler ? '🧑' : '👶'}</span>
            <span>{toddler ? t.audience.parent : t.audience.kid}</span>
          </button>
        )}
      </nav>

      <div className="hub__body">
        <Outlet />
      </div>

      {showAdd && (
        <button type="button" className="add-fab" onClick={() => setAddOpen(true)} aria-label={t.capture.add}>
          <Icon name="plus-bold" size={26} />
        </button>
      )}
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
    </AddSheetContext.Provider>
  )
}
