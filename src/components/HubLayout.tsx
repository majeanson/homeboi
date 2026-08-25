import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { BOARD_KEY, CERCLE_KEY } from '../lib/queryKeys'
import { MEALS_KEY } from './kitchen/types'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useProfile } from '../lib/profile'
import { useHabitCheckinTrigger } from '../lib/habitCheckin'
import { onIdleDebug, idleOverrideMs } from '../lib/idleDebug'
import { useTapToHearListener } from '../lib/tapToHear'
import { useTour } from '../lib/tour'
import { useTourOfferDot } from '../lib/tourOffer'
import { useAmbient } from '../lib/ambient'
import { useKeepAwake } from '../lib/keepAwake'
import { useWakeLock } from '../lib/useWakeLock'
import { AmbientScreen } from './AmbientScreen'
import { onAuthLost } from '../lib/authEvents'
import { clearDeviceToken, isPaired, isGuestLocked } from '../lib/device'
import { useGuestKind } from '../lib/guestKind'
import { Icon, InlineIcon, type IconName } from './Icon'
import { AddSheet } from './AddSheet'
import { DetailProvider } from './detail/DetailProvider'
import { KidExitGate } from './KidExitGate'
import { OfflineBanner } from './OfflineBanner'
import { AddSheetContext, SECTION_MODES, FORM_ROUTES, ADD_MODES, OPERATOR_MODES, type AddSheetMode } from '../lib/addSheet'
import { useAuth } from '../lib/auth'
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
// Order = the canonical importance order, mirrored by the themed Réglages tabs
// (pages/Operator SECTIONS) and the guide taxonomy (CONCEPT_THEMES): board →
// kitchen → liste → notes → maison → settings.
const TABS: {
  to: string
  key: 'today' | 'kitchen' | 'list' | 'notes' | 'maison' | 'operator'
  icon: IconName
  color: string
}[] = [
  { to: '/board', key: 'today', icon: 'sun-bold', color: '#D9842A' }, // marigold
  { to: '/kitchen', key: 'kitchen', icon: 'carrot-bold', color: '#C2563A' }, // terracotta
  { to: '/liste', key: 'list', icon: 'sparkle-bold', color: '#5891AC' }, // sky
  { to: '/notes', key: 'notes', icon: 'file-text-bold', color: '#2A8F85' }, // teal — inherited from Le cercle
  { to: '/maison', key: 'maison', icon: 'house-bold', color: '#95527A' }, // berry — inherited from Routines
  { to: '/settings', key: 'operator', icon: 'gear-six-bold', color: '#6B8A52' }, // sage
]

// C-24 (bmad/08): warm the tab you're ABOUT to open. Each entry mirrors that
// page's own primary read — the key AND endpoint must match the page's useQuery
// pair exactly, or the prefetch warms a cache nobody reads. Réglages is
// deliberately absent (not a glance surface; it loads its own slices).
const TAB_PREFETCH: Record<string, { key: string[]; path: string }> = {
  '/board': { key: BOARD_KEY, path: 'board' },
  '/liste': { key: BOARD_KEY, path: 'board' }, // La liste rides the board payload
  '/kitchen': { key: MEALS_KEY, path: 'meals' },
  // Maison and Les notes both BLOCK on the shared `cercle` read (each returns
  // <Loading/> until it lands) and only then render their own section — so that,
  // not the section's own query, is what a warm tab needs. Warming ROUTINES_KEY /
  // FAMILY_NOTES_KEY instead left the spinner exactly as long as before: the
  // nav restructure inherited those from the old /routines + /cercle rows, whose
  // pages really did lead with them.
  '/maison': { key: CERCLE_KEY, path: 'cercle' },
  '/notes': { key: CERCLE_KEY, path: 'cercle' },
}

export function HubLayout() {
  const t = useT()
  const { audience, locked, guestPreview } = useAudience()
  const { surface } = useSurface()
  // Keep the screen lit while the hub is open, so a wall tablet doesn't dim/sleep on
  // the board glance. Per-device opt-out (Réglages ▸ Affichage ▸ « Garder l'écran
  // allumé »), default ON; releases the lock the moment it's turned off. The lock
  // only holds while the tab is visible, so a backgrounded phone still sleeps normally.
  useWakeLock(useKeepAwake())
  // Tap-to-hear everywhere (bmad/08 A-2): in the toddler/simple lenses (+ the
  // per-device voice pref), a ~500 ms hold on any content row reads it aloud.
  // Shell-level so every tab gets it without per-row wiring; defensively scoped
  // off drags, the exit gate, form fields, modals and scrolling (lib/tapToHear).
  useTapToHearListener()
  // A-5 (bmad/08): the discovery tour's quiet auto-offer — a whisper-dot on the
  // Réglages tab for a heavy editor when the cache already knows features sleep.
  // No count, no red, at most once a month; Découvrir stamps it (lib/tourOffer).
  const tourDot = useTourOfferDot()
  const loc = useLocation()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  // For the ?plus= deep-link only: an operator-grade mode needs a session or its
  // FormScene bounces. "Still loading" counts as signed in so an operator's link
  // survives the auth round-trip (the Operator-page fullAccess precedent).
  const { signedIn, loading: authLoading } = useAuth()
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
  // C-24: prefetch a tab's primary query on press-start/hover (see TAB_PREFETCH).
  // 30 s staleTime: within it the prefetch is a pure cache-hit no-op, so hovering
  // back and forth never spams the Worker; past it, one background refetch warms
  // the pane. Fire-and-forget — prefetchQuery never throws to the UI.
  const warmTab = useCallback(
    (to: string) => {
      const p = TAB_PREFETCH[to]
      if (!p) return
      void qc.prefetchQuery({ queryKey: p.key, queryFn: () => api(p.path), staleTime: 30_000 })
    },
    [qc],
  )
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
  // ONE opener for the ＋ sheet — the AddSheetContext value and the ?plus=
  // deep-link effect below share it. The operator forms are full-screen scenes,
  // so those modes navigate instead of opening the sheet.
  const openAdd = useCallback(
    (mode?: AddSheetMode, modes?: AddSheetMode[]) => {
      const route = mode ? FORM_ROUTES[mode] : undefined
      if (route) {
        nav(route)
        return
      }
      setAddMode(mode ?? null)
      setAddModes(modes ?? null)
      setAddOpen(true)
    },
    [nav],
  )
  // The Kitchen page registers its three week actions here so the ＋ Add sheet
  // (rendered below, a sibling of the routed page) can offer them as tiles. The
  // live handlers ride in a ref — always fresh, never a dependency — while only
  // the display flags are state, and we bail when they're unchanged so the page
  // can re-register every render without a setState loop. See lib/kitchenActions.
  const kitchenHandlers = useRef<KitchenHandlers | null>(null)
  const [kitchenFlags, setKitchenFlags] = useState<KitchenActionFlags>(NO_KITCHEN_ACTIONS)
  const registerKitchen = useCallback((handlers: KitchenHandlers | null, flags: KitchenActionFlags) => {
    kitchenHandlers.current = handlers
    setKitchenFlags((prev) => (prev.active === flags.active && prev.canShop === flags.canShop ? prev : flags))
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

  // Land every section at its top: switching tabs (or the ＋ that navigates into a
  // section) must start you at the beginning of the new section, not wherever the
  // previous one happened to be scrolled to. `.hub__body` is the only scroller
  // (the document itself never scrolls — see hub.css), so reset it on each section
  // change. Keyed on `section` (the first path segment), not the full pathname, so
  // a sub-tab flip or a ?tab= change within the same section leaves the scroll be.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [section])

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
  // « Le point du jour » opens itself: once on the first app open of a new local day,
  // and when a habit's reminder time comes due. Shell-level (not on the Board page) so
  // a kiosk parked on /kitchen still gets its morning open. Read-time only — there is
  // no push and no cron; `saver` lets a reminder land over the screensaver, which is
  // the calmest surface there is.
  useHabitCheckinTrigger(saver)
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
    // Idle behaviours run on EVERY surface (mobile included), not just the kiosk:
    // a wall tablet is often signed in as the operator (surface=mobile after
    // Login), and we still want it to drift/screensave. Each behaviour is
    // individually opt-out in Réglages ▸ Affichage ▸ Mode veille, so anyone who
    // doesn't want a screensaver on their phone just turns it off. The Debug tab's
    // speed override still collapses the windows to seconds for observability.
    const override = idleOverrideMs()
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
    profileId,
    setMemberId,
    idleTick,
    ambient.returnHome,
    ambient.returnHomeMin,
    ambient.screensaver,
    ambient.idleMin,
  ])

  const toddler = audience === 'toddler'
  const simple = audience === 'simple'
  // Both simplified lenses (pre-reader toddler + post-reader simple) drop Réglages,
  // the ＋ FAB and the collapsible rail, and get an exit gate — the difference is
  // only the math challenge (a child needs it, a grandma doesn't). `restricted`
  // captures "not the full parent chrome"; branch on `toddler`/`simple` where they
  // genuinely differ (the board view swap, the exit-gate math).
  const restricted = toddler || simple
  // `guest` = read-only session (hides every mutating control + the ＋ FAB, shows
  // the banner): a link babysitter OR the operator's settings preview. Either way
  // the server independently 403s every guest write.
  //
  // A guest KEEPS Réglages. Barring it outright also took the in-app guide, the
  // language switch, the audience lens and « Disposition » — none of which write to
  // the household, and all of which are the reason to open the app at all (the
  // public demo is nothing but a guest link — functions/api/demo.ts). Operator
  // narrows what's INSIDE instead: Comprendre + the device-local subs (GUEST_SUBS).
  const guest = isGuestLocked() || guestPreview
  const guestLocked = isGuestLocked()
  // Capture is a parent action (the ＋ Add sheet). Not for a toddler, not in
  // settings. The floating ＋ FAB rides bottom-right on every parent tab —
  // including the mobile board (no separate in-page add button there).
  // A guest can't write — drop the ＋ entirely (every capture/add 403s anyway).
  // The simplified lenses drop it too: a toddler doesn't capture, and a simple-lens
  // grandma adds via the inline field on the full list she inherits, not the ＋.
  // Computed BEFORE the early returns so the ?plus= effect below can gate on it.
  const showAdd = !locked && !isSettings && !restricted && !guest
  // ?plus= — a guide « Essayer » link can open the ＋ sheet from a URL: '1' opens
  // the current section's chooser, a mode name jumps to that tile
  // (/board?plus=mot). Consumed first in ONE functional replace write (so
  // back/refresh never re-opens), then ignored wherever the FAB itself is hidden
  // (toddler lock, guest, Réglages). An operator-grade mode falls back to the
  // plain chooser when the device isn't signed in — its FormScene would bounce.
  useEffect(() => {
    const plus = params.get('plus')
    if (!plus) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('plus')
        return next
      },
      { replace: true },
    )
    if (!showAdd) return
    const mode = plus !== '1' && (ADD_MODES as readonly string[]).includes(plus) ? (plus as AddSheetMode) : undefined
    if (mode && OPERATOR_MODES.has(mode) && !(signedIn || authLoading)) {
      openAdd()
      return
    }
    openAdd(mode)
  }, [params, setParams, showAdd, signedIn, authLoading, openAdd])

  // A guided-tour step can walk INSIDE the ＋ sheet (`sheet: true` in
  // lib/tourContent): while such a step is active, hold the current section's
  // chooser open; on the next non-sheet step (or the tour ending) let it go.
  // Ref-tracked so we only ever close a sheet the tour itself opened — a user's
  // own open sheet is never yanked shut by an unrelated tour step.
  const { activeTour, stepIndex: tourStepIndex } = useTour()
  const tourWantsSheet = !!activeTour?.steps[tourStepIndex]?.sheet && showAdd
  const tourHeldSheet = useRef(false)
  useEffect(() => {
    if (tourWantsSheet) {
      setAddMode(null)
      setAddModes(null)
      setAddOpen(true)
    } else if (tourHeldSheet.current) {
      setAddOpen(false)
    }
    tourHeldSheet.current = tourWantsSheet
  }, [tourWantsSheet])
  // A CURATED share link (sitter / welcome) has no business in the hub — its data
  // 403s server-side anyway. Bounce it to its own standalone scene. showcase stays
  // (it IS the read-only hub); a settings-preview guest isn't a link guest, so it's
  // unaffected. guestKind resolves async (whoami); until then a link normally lands
  // on its scene route directly (the operator's URL targets it), so no flash.
  const guestKind = useGuestKind()
  if (guestLocked && guestKind === 'sitter') return <Navigate to="/handoff" replace />
  if (guestLocked && guestKind === 'welcome') return <Navigate to="/welcome" replace />
  if (guestLocked && guestKind === 'family') return <Navigate to="/family" replace />
  // The simplified lenses have no business in Réglages — not on a locked kiosk, and
  // not in an unlocked parent preview either (a kid/grandma mustn't reach settings
  // via a stray /settings URL). Only the parent view (and the guest PREVIEW) open it.
  if ((locked || restricted) && isSettings) return <Navigate to="/board" replace />

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

  // Réglages hides from the nav whenever a simplified lens is up: on a locked
  // kiosk a three-year-old (or a visiting grandma) must not reach settings/billing
  // (PRD C5), and the same holds for an unlocked preview — the lens is a one-way
  // door, so Réglages only ever returns by relaunching into parent (?kid=0/?simple=0).
  // A guest keeps the tab (see above) — it's how the demo reaches the guide.
  const tabs = locked || restricted ? TABS.filter((tab) => tab.to !== '/settings') : TABS
  // The collapse only applies on the kiosk left rail; mobile's bottom bar stays.
  // Never in a simplified lens — the viewer mustn't be able to hide their own
  // navigation (or the exit gate that lives in the rail), so the section column
  // is non-collapsible there even if a parent left it collapsed before flipping.
  const canCollapse = surface === 'kiosk' && !restricted
  const railCollapsed = canCollapse && navCollapsed

  return (
    <AddSheetContext.Provider value={{ open: openAdd }}>
    <KitchenActionsContext.Provider value={kitchenCtx}>
    <DetailProvider>
    <div className="page hub" data-audience={audience} data-surface={surface} data-nav-collapsed={railCollapsed || undefined} data-fab={showAdd || undefined}>
      {/* Reclaim the rail's width: a parent can tuck the section column away on a
          kiosk so the agenda/list gets the whole wall. A small caret re-opens it. */}
      {railCollapsed && (
        <button type="button" className="hubnav-reopen" onClick={toggleNav} aria-label={t.nav.showMenu} title={t.nav.showMenu}>
          <Icon name="caret-right-bold" size={20} />
        </button>
      )}
      <nav className="hubnav" aria-label={t.nav.sections} data-tour="hubnav">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `hubnav__btn${isActive ? ' is-active' : ''}`}
            // Perceived speed (C-24): start fetching the tab's primary data the
            // moment the press/hover BEGINS, so by route-mount the cache is warm
            // and the pane lands full. staleTime keeps it a no-op when the live
            // poll already owns fresh data; prefetchQuery swallows errors, and
            // polling/realtime stay in charge of correctness as always.
            onPointerDown={() => warmTab(tab.to)}
            onMouseEnter={() => warmTab(tab.to)}
          >
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} size={22} color={isActive ? 'var(--accent-ink)' : tab.color} />
                {/* Six tabs share a phone's width (~57px each), so the full section
                    names ellipsized on every screen — « La cuisi… », « Aujourd… »
                    (UX review 2026-07-14). The bottom bar uses SHORT names that fit
                    whole; the kiosk rail, which has the room, keeps the real ones.
                    The accessible name stays the full section name either way. */}
                <span aria-hidden="true">{surface === 'mobile' ? t.navShort[tab.key] : t.nav[tab.key]}</span>
                <span className="sr-only">{t.nav[tab.key]}</span>
                {/* A-5 whisper-dot: something sleeps in Découvrir. Decorative —
                    the tab keeps its plain section name (no urgency semantics). */}
                {tab.to === '/settings' && tourDot && <span className="hubnav__whisper" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        ))}

        {/* Entering the toddler lens lives in Réglages ▸ Display now (the audience
            switch there), not in the nav — a parent flips to Enfant from settings.
            Coming back OUT is still a deliberate adult act via KidExitGate below. */}

        {/* The way back OUT of a simplified lens: a visible footer switch behind an
            exit gate. Toddler needs the full parental gate (3s hold + a math
            challenge a pre-reader can't clear); the simple/grandma lens is a capable
            adult, so a 3s hold alone lets her out (no condescending arithmetic). */}
        {restricted && <KidExitGate requireMath={toddler} />}

        {/* "Tuck the rail away" caret — lives at the BOTTOM of the kiosk column
            (pushed down by margin-top:auto) so it sits out of the way under the
            tabs rather than crowning them. */}
        {canCollapse && (
          <button type="button" className="hubnav__collapse" onClick={toggleNav} aria-label={t.nav.hideMenu} title={t.nav.hideMenu}>
            <Icon name="caret-left-bold" size={18} />
          </button>
        )}
      </nav>

      <div className="hub__body" ref={bodyRef}>
        <OfflineBanner />
        {guest && (
          <p className="board__empty mono" role="status" style={{ textAlign: 'center', opacity: 0.8 }}>
            <InlineIcon name="user-bold" />{' '}
            {guestLocked && guestKind === 'showcase' ? t.guest.demoBadge : t.guest.banner}
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
            // A section with exactly ONE mode skips the chooser and goes straight
            // to it — mirrors the single-mode skip Routines used to have on its own
            // tab: /notes has just 'cnote', so the ＋ jumps straight into the rich
            // editor instead of showing a one-tile "chooser".
            const only = sectionModes.length === 1 ? sectionModes[0] : null
            if (only && FORM_ROUTES[only]) {
              nav(FORM_ROUTES[only])
              return
            }
            // Every kitchen sub-tab (Recettes included) opens the same blank-slate
            // ＋ chooser — no tab jumps you straight into a blank new recipe (that
            // read as "auto-creating" one). Creating a recipe is now an explicit
            // tap on the "Ajouter une recette" tile (navigate-only → the builder).
            // Maison: the ＋ opens the merged chooser (routine-pick / person / family /
            // connect / group / business / pet / carnet / import) like the other
            // tabs — all navigate-only or sheet tiles (SECTION_MODES.maison). The
            // routine-pick tile opens the manage picker (new routine + edit an
            // existing one) in the sheet; each choice routes on to the full-screen
            // builder scene. An unsigned kiosk has no operator form, so the sheet
            // falls through to the capture box (OPERATOR_MODES drops routine-pick).
            // The sheet always opens on a blank chooser — no tile pre-selected,
            // no form pre-shown — in every other section (Marc's ask). The operator
            // picks what to add, including the Garde-manger low-stock form.
            setAddMode(null)
            setAddModes(null)
            setAddOpen(true)
          }}
          // The FAB always opens the section's blank-slate chooser/sheet, so its
          // accessible name matches that sheet's TITLE per section (see AddSheet
          // `title`) — not a specific sub-form. (It used to promise the pantry
          // low-stock form on the kitchen Garde-manger tab while actually opening
          // the kitchen chooser — an aria/behaviour mismatch, now removed.)
          aria-label={
            section === 'kitchen'
              ? t.kitchen.addTitle
              : section === 'maison'
                ? t.maison.addTitle
                : section === 'notes'
                  ? t.cercle.familyNotes.newNote
                  : section === 'liste'
                    ? t.list.addTitle
                    : t.common.add
          }
          title={
            section === 'kitchen'
              ? t.kitchen.addTitle
              : section === 'maison'
                ? t.maison.addTitle
                : section === 'notes'
                  ? t.cercle.familyNotes.newNote
                  : section === 'liste'
                    ? t.list.addTitle
                    : t.common.add
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
