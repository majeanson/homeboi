import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useProfile } from '../lib/profile'
import { onIdleDebug, idleOverrideMs } from '../lib/idleDebug'
import { useAmbient } from '../lib/ambient'
import { AmbientScreen } from './AmbientScreen'
import { onAuthLost } from '../lib/authEvents'
import { clearDeviceToken, isPaired, isGuestLocked } from '../lib/device'
import { Icon, InlineIcon, type IconName } from './Icon'
import { AddSheet } from './AddSheet'
import { DetailProvider } from './detail/DetailProvider'
import { KidExitGate } from './KidExitGate'
import { OfflineBanner } from './OfflineBanner'
import { AddSheetContext, SECTION_MODES, FORM_ROUTES, type AddSheetMode } from '../lib/addSheet'
import {
  KitchenActionsContext,
  NO_KITCHEN_ACTIONS,
  type KitchenAction,
  type KitchenActionFlags,
  type KitchenHandlers,
} from '../lib/kitchenActions'

// The hub shell, surface-aware. KIOSK (wall display): a vertical column of big
// section buttons down the left, calm and readable across the room. MOBILE
// (phone): the same sections become a thumb-reach bottom tab bar, with the ＋
// quick-add lifted above it. Réglages is the last section button (parent view
// only). The nav also carries the Parent/Enfant switch — flip to preview what
// the toddler sees on any tab, flip back the same way. Nothing floats over the
// page except the single ＋ (parent view only).
const TABS: {
  to: string
  key: 'today' | 'kitchen' | 'routines' | 'list' | 'cercle' | 'operator'
  icon: IconName
  color: string
}[] = [
  { to: '/board', key: 'today', icon: 'sun-bold', color: '#D9842A' }, // marigold
  { to: '/kitchen', key: 'kitchen', icon: 'carrot-bold', color: '#C2563A' }, // terracotta
  { to: '/routines', key: 'routines', icon: 'smiley-bold', color: '#95527A' }, // berry
  { to: '/cercle', key: 'cercle', icon: 'users-three-bold', color: '#C45E86' }, // rose
  { to: '/liste', key: 'list', icon: 'sparkle-bold', color: '#5891AC' }, // sky
  { to: '/settings', key: 'operator', icon: 'gear-six-bold', color: '#6B8A52' }, // sage
]

export function HubLayout() {
  const t = useT()
  const { audience, locked, guestPreview } = useAudience()
  const { surface } = useSurface()
  const loc = useLocation()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  // Kiosk-only: collapse the left section rail to reclaim its width for the body
  // (a parent who wants the whole wall for the agenda/list). Persisted so the
  // choice survives a reboot; mobile keeps its bottom bar and ignores this.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('bb_kiosk_nav_collapsed') === '1'
    } catch {
      return false
    }
  })
  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem('bb_kiosk_nav_collapsed', next ? '1' : '0')
      } catch {
        /* private mode — the toggle still works for this session */
      }
      return next
    })
  }, [])
  // null = "this section's default" — the ＋ is contextual now (recipes in the
  // kitchen, list items on Liste); only an explicit open('routine')-style call
  // pins a mode.
  const [addMode, setAddMode] = useState<AddSheetMode | null>(null)
  // An optional modes override for an open() call: Réglages (where the FAB is
  // hidden) opens a single-form sheet — open('chore', ['chore']) — instead of the
  // section's whole chooser. null = use the current section's modes.
  const [addModes, setAddModes] = useState<AddSheetMode[] | null>(null)
  // The Kitchen page registers its three week actions here so the ＋ Add sheet
  // (rendered below, a sibling of the routed page) can offer them as tiles. The
  // live handlers ride in a ref — always fresh, never a dependency — while only
  // the display flags are state, and we bail when they're unchanged so the page
  // can re-register every render without a setState loop. See lib/kitchenActions.
  const kitchenHandlers = useRef<KitchenHandlers | null>(null)
  const [kitchenFlags, setKitchenFlags] = useState<KitchenActionFlags>(NO_KITCHEN_ACTIONS)
  const registerKitchen = useCallback((handlers: KitchenHandlers | null, flags: KitchenActionFlags) => {
    kitchenHandlers.current = handlers
    setKitchenFlags((prev) =>
      prev.active === flags.active &&
      prev.canShop === flags.canShop &&
      prev.canAiSuggest === flags.canAiSuggest &&
      prev.aiBusy === flags.aiBusy &&
      prev.hasRecipes === flags.hasRecipes &&
      prev.canUseUp === flags.canUseUp
        ? prev
        : flags,
    )
  }, [])
  const runKitchen = useCallback((action: KitchenAction) => kitchenHandlers.current?.[action]?.(), [])
  const kitchenCtx = useMemo(
    () => ({ flags: kitchenFlags, register: registerKitchen, run: runKitchen }),
    [kitchenFlags, registerKitchen, runKitchen],
  )
  const isSettings = loc.pathname.startsWith('/settings')
  // Which section the ＋ serves, from the first path segment ('/kitchen/…' →
  // kitchen). Unknown paths fall back to the board's generic capture sheet.
  const section = loc.pathname.split('/')[1] || 'board'
  const sectionModes = SECTION_MODES[section] ?? SECTION_MODES.board
  // The kitchen's three sub-tabs live in ?tab= (Kitchen page, useTabParam) —
  // default 'meals'. The ＋ FAB reads it so it adds what THIS tab is about:
  // Recettes → straight to the recipe builder, Garde-manger → the low-stock form,
  // Repas → the meal-planner chooser (default).
  const kitchenTab = section === 'kitchen' ? new URLSearchParams(loc.search).get('tab') || 'meals' : null

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
  const ambient = useAmbient()
  const [idleWarn, setIdleWarn] = useState(false)
  const [saver, setSaver] = useState(false)
  // Debug (Réglages ▸ Debug): force the warn chip / the drift / the screensaver on
  // demand, and bump a tick so the timers below re-arm when the speed override changes.
  const [idleTick, setIdleTick] = useState(0)
  useEffect(
    () =>
      onIdleDebug((kind) => {
        if (kind === 'warn') setIdleWarn(true)
        else if (kind === 'drift') {
          setIdleWarn(false)
          setMemberId(null)
        } else if (kind === 'screensaver') setSaver(true)
        else setIdleTick((n) => n + 1)
      }),
    [setMemberId],
  )
  useEffect(() => {
    // Idle is normally a KIOSK behaviour, but the Debug tab's speed override arms
    // it on ANY surface — otherwise the timed drift/screensaver can't be observed
    // on a dev phone/laptop.
    const override = idleOverrideMs()
    if (surface !== 'kiosk' && override == null) {
      setIdleWarn(false)
      setSaver(false)
      return
    }
    // Two independent idle behaviours, each opt-out-able (lib/ambient): the
    // return-to-Maisonnée drift (needs a picked profile to clear) and the
    // screensaver. A debug speed override collapses every window to the same few
    // seconds so the whole thing is observable at once.
    const driftOn = ambient.returnHome && !!profileId
    const saverOn = ambient.screensaver
    if (!driftOn && !saverOn) {
      setIdleWarn(false)
      setSaver(false)
      return
    }
    const DRIFT = override ?? ambient.returnHomeMin * 60_000
    const WARN = DRIFT - Math.min(30_000, Math.floor(DRIFT / 2)) // heads-up leads the drift
    const SAVER = override ?? ambient.idleMin * 60_000
    let tWarn: ReturnType<typeof setTimeout>
    let tDrift: ReturnType<typeof setTimeout>
    let tSaver: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(tWarn)
      clearTimeout(tDrift)
      clearTimeout(tSaver)
      setIdleWarn(false)
      setSaver(false) // any interaction also wakes the screensaver
      if (driftOn) {
        tWarn = setTimeout(() => setIdleWarn(true), WARN)
        tDrift = setTimeout(() => {
          setIdleWarn(false)
          setMemberId(null)
        }, DRIFT)
      }
      if (saverOn) tSaver = setTimeout(() => setSaver(true), SAVER)
    }
    reset()
    window.addEventListener('pointerdown', reset, { passive: true })
    window.addEventListener('keydown', reset)
    return () => {
      clearTimeout(tWarn)
      clearTimeout(tDrift)
      clearTimeout(tSaver)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [
    surface,
    profileId,
    setMemberId,
    idleTick,
    ambient.returnHome,
    ambient.returnHomeMin,
    ambient.screensaver,
    ambient.idleMin,
  ])

  const toddler = audience === 'toddler'
  // `guest` = read-only session (hides every mutating control + the ＋ FAB, shows
  // the banner): a link babysitter OR the operator's settings preview.
  // `guestLocked` = the LINK guest only — that one is also barred from Réglages
  // (hide the tab, bounce a stray /settings URL). The settings-PREVIEW guest keeps
  // Réglages so the operator can switch back to Parent, the way you leave toddler
  // mode. Either way the server independently 403s every guest write.
  const guest = isGuestLocked() || guestPreview
  const guestLocked = isGuestLocked()
  // The toddler lens has no business in Réglages — not on a locked kiosk, and
  // not in an unlocked parent preview either (a kid mustn't reach settings via a
  // stray /settings URL). Only the parent view (and the guest PREVIEW) open Réglages.
  if ((locked || toddler || guestLocked) && isSettings) return <Navigate to="/board" replace />

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
  // A guest can't write — drop the ＋ entirely (every capture/add 403s anyway).
  const showAdd = !locked && !isSettings && !toddler && !guest
  // Réglages hides from the nav whenever the toddler lens is up: on a locked
  // kiosk a three-year-old must not reach settings/billing (PRD C5), and the same
  // holds for an unlocked preview — the kid view is a one-way door, so Réglages
  // only ever returns by relaunching back into the parent view (?kid=0).
  const tabs = locked || toddler || guestLocked ? TABS.filter((tab) => tab.to !== '/settings') : TABS
  // The collapse only applies on the kiosk left rail; mobile's bottom bar stays.
  // Never in the toddler lens — a pre-reader mustn't be able to hide their own
  // navigation (or the KidExitGate that lives in the rail), so the section column
  // is non-collapsible there even if a parent left it collapsed before flipping.
  const canCollapse = surface === 'kiosk' && !toddler
  const railCollapsed = canCollapse && navCollapsed

  return (
    <AddSheetContext.Provider
      value={{
        open: (mode, modes) => {
          // The operator forms are full-screen scenes now — navigate instead of
          // opening the sheet (the Réglages add buttons reach them this way).
          const route = mode ? FORM_ROUTES[mode] : undefined
          if (route) {
            nav(route)
            return
          }
          setAddMode(mode ?? null)
          setAddModes(modes ?? null)
          setAddOpen(true)
        },
      }}
    >
    <KitchenActionsContext.Provider value={kitchenCtx}>
    <DetailProvider>
    <div className="page hub" data-audience={audience} data-surface={surface} data-nav-collapsed={railCollapsed || undefined} data-fab={showAdd || undefined}>
      {/* Reclaim the rail's width: a parent can tuck the section column away on a
          kiosk so the agenda/list gets the whole wall. A small caret re-opens it. */}
      {railCollapsed && (
        <button type="button" className="hubnav-reopen" onClick={toggleNav} aria-label={t.nav.showMenu}>
          <Icon name="caret-right-bold" size={20} />
        </button>
      )}
      <nav className="hubnav" aria-label="sections" data-tour="hubnav">
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

        {/* Entering the toddler lens lives in Réglages ▸ Display now (the audience
            switch there), not in the nav — a parent flips to Enfant from settings.
            Coming back OUT is still a deliberate adult act via KidExitGate below. */}

        {/* The way back OUT of the toddler lens: a visible footer switch behind a
            parental gate (3s hold + a math challenge), so the one-way door still
            holds for the child but an adult can leave without an address bar. */}
        {toddler && <KidExitGate />}

        {/* "Tuck the rail away" caret — lives at the BOTTOM of the kiosk column
            (pushed down by margin-top:auto) so it sits out of the way under the
            tabs rather than crowning them. */}
        {canCollapse && (
          <button type="button" className="hubnav__collapse" onClick={toggleNav} aria-label={t.nav.hideMenu} title={t.nav.hideMenu}>
            <Icon name="caret-left-bold" size={18} />
          </button>
        )}
      </nav>

      <div className="hub__body">
        <OfflineBanner />
        {guest && (
          <p className="board__empty mono" role="status" style={{ textAlign: 'center', opacity: 0.8 }}>
            <InlineIcon name="user-bold" /> {t.guest.banner}
          </p>
        )}
        <Outlet />
      </div>

      {idleWarn && (
        <p className="board-idle board-idle--shell mono" role="status">
          <InlineIcon name="hourglass-high-bold" /> {t.board.idleSoon}
        </p>
      )}

      {showAdd && (
        <button
          type="button"
          className="add-fab"
          data-tour="add-fab"
          onClick={() => {
            // Recettes tab: the recipe builder is a full-screen route, so skip the
            // sheet and go straight there (its "add" is navigate-only anyway).
            if (kitchenTab === 'recipes') {
              nav('/kitchen/recipe/new')
              return
            }
            // Le cercle: the ＋ opens the section chooser (person / family / connect /
            // group) like the other tabs — all navigate-only tiles (SECTION_MODES.cercle).
            // Routines: the ＋ opens the manage picker (new routine + edit an
            // existing one) in the sheet; each choice routes on to the full-screen
            // builder scene. An unsigned kiosk has no operator form, so the sheet
            // falls through to the capture box (OPERATOR_MODES drops routine-pick).
            // The sheet always opens on a blank chooser — no tile pre-selected,
            // no form pre-shown — in every section (Marc's ask). The operator
            // picks what to add, including the Garde-manger low-stock form.
            setAddMode(null)
            setAddModes(null)
            setAddOpen(true)
          }}
          aria-label={
            section === 'kitchen'
              ? kitchenTab === 'recipes'
                ? t.recipes.add
                : kitchenTab === 'pantry'
                  ? t.kitchen.lowAdd
                  : t.kitchen.addTitle
              : section === 'routines'
                ? t.routines.add
                : section === 'cercle'
                  ? t.cercle.addTitle
                  : section === 'liste'
                    ? t.list.addTitle
                    : t.capture.add
          }
        >
          <Icon name="plus-bold" size={26} />
        </button>
      )}
      <AddSheet open={addOpen} modes={addModes ?? sectionModes} initialMode={addMode} onClose={() => setAddOpen(false)} />
      {/* Ambient screensaver — full-screen idle face; any pointer/key wakes it
          (the idle effect's `reset` already clears `saver`, this just mirrors it). */}
      <AmbientScreen show={saver} onWake={() => setSaver(false)} />
    </div>
    </DetailProvider>
    </KitchenActionsContext.Provider>
    </AddSheetContext.Provider>
  )
}
