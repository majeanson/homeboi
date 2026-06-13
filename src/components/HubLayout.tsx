import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useProfile } from '../lib/profile'
import { onAuthLost } from '../lib/authEvents'
import { clearDeviceToken, isPaired } from '../lib/device'
import { Icon, type IconName } from './Icon'
import { AddSheet } from './AddSheet'
import { KidExitGate } from './KidExitGate'
import { AddSheetContext, SECTION_MODES, type AddSheetMode } from '../lib/addSheet'

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
  const nav = useNavigate()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  // null = "this section's default" — the ＋ is contextual now (recipes in the
  // kitchen, list items on Liste); only an explicit open('routine')-style call
  // pins a mode.
  const [addMode, setAddMode] = useState<AddSheetMode | null>(null)
  const isSettings = loc.pathname.startsWith('/settings')
  // Which section the ＋ serves, from the first path segment ('/kitchen/…' →
  // kitchen). Unknown paths fall back to the board's generic capture sheet.
  const section = loc.pathname.split('/')[1] || 'board'
  const sectionModes = SECTION_MODES[section] ?? SECTION_MODES.board

  // A PAIRED device getting 401s means its token was revoked (re-paired, device
  // removed in Réglages, DB reset) — latch a recovery screen at the shell level.
  // Crucially this survives the kid lock: before this, a locked kiosk whose
  // token died was stuck on per-page prompts with no tappable way out (the only
  // fix was URL-editing ?kid=0 + clearing storage). Showing re-pair to a toddler
  // is safe — pairing still requires an operator's approval from their phone
  // (PRD C5 holds). NOT latched for unpaired devices: their 401 just means "not
  // onboarded yet", which the per-page PairPrompt already handles.
  const [pairingLost, setPairingLost] = useState(false)
  useEffect(
    () =>
      onAuthLost(() => {
        if (isPaired()) setPairingLost(true)
      }),
    [],
  )

  // Shared kiosk: when someone has tapped their face, drift back to Maisonnée
  // after a few idle minutes so the wall tablet never gets "stuck" as one person.
  // Shell-level (not Board) so wandering to Réglages or the kitchen doesn't pin
  // the picked face forever. Mobile (a personal device) is left as-is. Resets on
  // any interaction; a quiet heads-up appears 30 s before the drift so a parent
  // mid-glance isn't silently switched back (mis-attributing what they add).
  const { memberId: profileId, setMemberId } = useProfile()
  const [idleWarn, setIdleWarn] = useState(false)
  useEffect(() => {
    if (surface !== 'kiosk' || !profileId) {
      setIdleWarn(false)
      return
    }
    const IDLE = 3 * 60 * 1000
    const WARN = IDLE - 30 * 1000
    let timer: ReturnType<typeof setTimeout>
    let warnTimer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      clearTimeout(warnTimer)
      setIdleWarn(false)
      warnTimer = setTimeout(() => setIdleWarn(true), WARN)
      timer = setTimeout(() => {
        setIdleWarn(false)
        setMemberId(null)
      }, IDLE)
    }
    reset()
    window.addEventListener('pointerdown', reset, { passive: true })
    window.addEventListener('keydown', reset)
    return () => {
      clearTimeout(timer)
      clearTimeout(warnTimer)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [surface, profileId, setMemberId])

  const toddler = audience === 'toddler'
  // The toddler lens has no business in Réglages — not on a locked kiosk, and
  // not in an unlocked parent preview either (a kid mustn't reach settings via a
  // stray /settings URL). Only the parent view opens Réglages.
  if ((locked || toddler) && isSettings) return <Navigate to="/board" replace />

  if (pairingLost) {
    return (
      <div className="page hub" data-audience={audience} data-surface={surface}>
        <main className="narrow pair-lost">
          <h1>{t.pair.lostTitle}</h1>
          <p className="lead">{t.pair.lostLead}</p>
          <div className="pair-lost__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                clearDeviceToken()
                nav('/pair')
              }}
            >
              {t.pair.repair}
            </button>
            {/* A server blip can 401 too — let a human re-test before unpairing. */}
            <button
              type="button"
              className="btn btn--ghost mono"
              onClick={() => {
                setPairingLost(false)
                void qc.refetchQueries({ type: 'active' })
              }}
            >
              {t.pair.retry}
            </button>
          </div>
        </main>
      </div>
    )
  }

  // Capture is a parent action (the ＋ Add sheet). Not for a toddler, not in
  // settings. The floating ＋ FAB rides bottom-right on every parent tab —
  // including the mobile board (no separate in-page add button there).
  const showAdd = !locked && !isSettings && !toddler
  // Réglages hides from the nav whenever the toddler lens is up: on a locked
  // kiosk a three-year-old must not reach settings/billing (PRD C5), and the same
  // holds for an unlocked preview — the kid view is a one-way door, so Réglages
  // only ever returns by relaunching back into the parent view (?kid=0).
  const tabs = locked || toddler ? TABS.filter((tab) => tab.to !== '/settings') : TABS

  return (
    <AddSheetContext.Provider
      value={{
        open: (mode) => {
          setAddMode(mode ?? null)
          setAddOpen(true)
        },
      }}
    >
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

        {/* Parent → Enfant, right in the nav (never floating). The kid view is a
            ONE-WAY door: this only ever enters it, and it vanishes the moment the
            toddler lens is up — so a child has no tap back to the parent view or
            Réglages, whether the kiosk was locked with ?kid=1 or a parent just
            tapped in to preview. Coming back out is a deliberate adult act:
            relaunch without ?kid=1 (or with ?kid=0). NEVER shown on a locked
            kiosk either (PRD C5). */}
        {!locked && !toddler && (
          <button
            type="button"
            className="hubnav__btn hubnav__peek"
            onClick={() => setAudience('toddler')}
            aria-label={t.audience.kidView}
          >
            <span className="hubnav__peek-pic" aria-hidden="true">👶</span>
            <span>{t.audience.kid}</span>
          </button>
        )}
      </nav>

      <div className="hub__body">
        <Outlet />
      </div>

      {idleWarn && (
        <p className="board-idle board-idle--shell mono" role="status">
          ⏳ {t.board.idleSoon}
        </p>
      )}

      {showAdd && (
        <button
          type="button"
          className="add-fab"
          onClick={() => {
            setAddMode(null)
            setAddOpen(true)
          }}
          aria-label={
            section === 'kitchen'
              ? t.kitchen.addTitle
              : section === 'routines'
                ? t.routines.add
                : section === 'liste'
                  ? t.list.addTitle
                  : t.capture.add
          }
        >
          <Icon name="plus-bold" size={26} />
        </button>
      )}
      <AddSheet open={addOpen} modes={sectionModes} initialMode={addMode} onClose={() => setAddOpen(false)} />

      {/* The toddler lens is a one-way door for the CHILD; this is the adult's
          way back out (long-press + math gate) — the only escape on an installed
          PWA with no address bar. Covers both a locked kiosk and a parent
          preview, since both can get stranded on a phone home-screen install. */}
      {toddler && <KidExitGate />}
    </div>
    </AddSheetContext.Provider>
  )
}
