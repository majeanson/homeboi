import { StrictMode, useState } from 'react'
// createRoot, not hydrateRoot — there's no prerender to match in the prototype,
// and even with one we'd render fresh over it (portal convention).
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { queryClient } from './lib/query'
import { LangContext, type Lang } from './i18n'
import { AudienceContext, type Audience } from './lib/audience'
import { SurfaceContext, type Surface } from './lib/surface'
import { ProfileContext } from './lib/profile'
import { CalmContext } from './lib/calm'
import { HelpContext } from './lib/help'
import { ToastProvider } from './lib/toast'
import { ConfirmProvider } from './lib/confirm'
import { AiErrorProvider } from './lib/aiErrorToast'
import { TourProvider } from './lib/tour'
import { TourOverlay } from './components/tour/TourOverlay'
import { registerSw } from './lib/registerSw'
import { trackVisualViewport } from './lib/viewportVars'
import { startDaypartDrift } from './lib/daypartDrift'
import { restorePersistedCache, startPersistingCache, clearPersistedCache } from './lib/persist'
import { startOutbox, clearOutbox } from './lib/outbox'
import { onAuthLost } from './lib/authEvents'
import { setGuestToken, clearGuestToken } from './lib/device'
import { connectRealtime } from './lib/realtime'
import './styles.css'

// Realtime push (#20) is SCAFFOLDED, not yet enabled. Flip this on only after the
// RealtimeHub Durable Object is deployed + verified DO-eligible (see wrangler.toml
// + OFFLINE/realtime notes). While false, connectRealtime is never called, so an
// undeployed DO can't even attempt the socket. It's wired here (not a dead file)
// so enabling is a one-line flip — and connectRealtime is fail-safe regardless.
const REALTIME_ENABLED = false

// `?guest=<token>` boots a babysitter / guest session: stash the read-only token
// in localStorage so lib/api sends it (on the X-Device-Token header) from the very
// first call, then strip it from the URL so it isn't shared/bookmarked verbatim.
// Mirrors the `?kid=1` latch — a deliberate link the operator hands out. Runs at
// module load, before first paint and before any api() call.
try {
  const q = new URLSearchParams(window.location.search)
  const guest = q.get('guest')
  if (guest) {
    setGuestToken(guest)
    q.delete('guest')
    const rest = q.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  }
} catch {
  /* noop — guest boot is best-effort */
}

function Root() {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('babillard-lang')
      if (saved === 'fr' || saved === 'en') return saved
    } catch {
      /* noop */
    }
    return 'fr'
  })
  function setLang(l: Lang) {
    setLangState(l)
    try {
      localStorage.setItem('babillard-lang', l)
    } catch {
      /* noop */
    }
    document.documentElement.lang = l
  }

  // `?kid=1` is the kiosk boot lock: it forces the toddler view AND latches
  // `locked` so a toddler can't flip back or reach Réglages. PERSISTED to
  // localStorage so it survives navigation (which drops the query param) AND a
  // reload/kiosk reboot. Unlock is a deliberate adult action: load `?kid=0`.
  const [kidLocked, setKidLocked] = useState<boolean>(() => {
    try {
      const kid = new URLSearchParams(window.location.search).get('kid')
      if (kid === '1') {
        localStorage.setItem('babillard-kid-lock', '1')
        return true
      }
      if (kid === '0') {
        localStorage.removeItem('babillard-kid-lock')
        return false
      }
      return localStorage.getItem('babillard-kid-lock') === '1'
    } catch {
      return false
    }
  })

  // Lock wins; else the last manual choice; else parent.
  const [audience, setAudienceState] = useState<Audience>(() => {
    if (kidLocked) return 'toddler'
    try {
      const saved = localStorage.getItem('babillard-audience')
      if (saved === 'parent' || saved === 'toddler') return saved
    } catch {
      /* noop */
    }
    return 'parent'
  })
  function setAudience(a: Audience) {
    // A locked kiosk (?kid=1) is pinned to the toddler lens — refuse ANY audience
    // change at the source, so the lock holds even if a stray code path (or a
    // future caller) tries to flip it. The only way out stays the deliberate
    // adult act of relaunching with ?kid=0 (handled at init above). PRD C5.
    if (kidLocked) return
    setAudienceState(a)
    try {
      localStorage.setItem('babillard-audience', a)
    } catch {
      /* noop */
    }
  }

  // The adult escape hatch, used by the parental gate in HubLayout. Clears the
  // ?kid=1 latch and drops back to the parent lens — the in-app equivalent of
  // relaunching with ?kid=0, for an installed PWA that has no address bar.
  // setAudience() refuses while kidLocked, so we clear the lock first then set
  // the audience through the raw setter.
  function unlock() {
    try {
      localStorage.removeItem('babillard-kid-lock')
      localStorage.setItem('babillard-audience', 'parent')
    } catch {
      /* noop */
    }
    setKidLocked(false)
    setAudienceState('parent')
  }

  // The device ROLE: kiosk (wall display) or mobile (phone). Chosen at /setup and
  // remembered. `?surface=kiosk|mobile` overrides (provisioning + e2e); `?kid=1`
  // implies kiosk. `chosen` records whether the role was set deliberately — the
  // `/` smart entry uses it to keep the marketing page for first-timers only.
  const [{ surface, surfaceChosen }, setSurfacePair] = useState<{ surface: Surface; surfaceChosen: boolean }>(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const qs = q.get('surface')
      if (qs === 'kiosk' || qs === 'mobile') {
        localStorage.setItem('babillard-surface', qs)
        return { surface: qs, surfaceChosen: true }
      }
      if (kidLocked) {
        localStorage.setItem('babillard-surface', 'kiosk')
        return { surface: 'kiosk', surfaceChosen: true }
      }
      const saved = localStorage.getItem('babillard-surface')
      if (saved === 'kiosk' || saved === 'mobile') return { surface: saved, surfaceChosen: true }
    } catch {
      /* noop */
    }
    return { surface: 'mobile', surfaceChosen: false }
  })
  function setSurface(s: Surface) {
    setSurfacePair({ surface: s, surfaceChosen: true })
    try {
      localStorage.setItem('babillard-surface', s)
    } catch {
      /* noop */
    }
  }

  // Which household member is using THIS device (pick-your-face). Null = no one
  // picked / "tout le monde". Persisted per device; drives the greeting, the
  // personal board emphasis, and write attribution (X-Profile header in lib/api).
  const [profile, setProfileState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('babillard-profile')
    } catch {
      return null
    }
  })
  function setProfile(id: string | null) {
    setProfileState(id)
    try {
      if (id) localStorage.setItem('babillard-profile', id)
      else localStorage.removeItem('babillard-profile')
    } catch {
      /* noop */
    }
  }

  // Calm mode defaults ON (the tenet); only an explicit opt-out persists.
  const [calm, setCalmState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('babillard-calm') !== 'off'
    } catch {
      return true
    }
  })
  function setCalm(c: boolean) {
    setCalmState(c)
    try {
      localStorage.setItem('babillard-calm', c ? 'on' : 'off')
    } catch {
      /* noop */
    }
  }

  // Tutorial mode defaults ON so a new household discovers the contextual "?"
  // help; only an explicit switch to expert persists.
  const [tutorial, setTutorialState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('babillard-tutorial') !== 'off'
    } catch {
      return true
    }
  })
  function setTutorial(v: boolean) {
    setTutorialState(v)
    try {
      localStorage.setItem('babillard-tutorial', v ? 'on' : 'off')
    } catch {
      /* noop */
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <LangContext.Provider value={{ lang, setLang }}>
        <AudienceContext.Provider value={{ audience, setAudience, locked: kidLocked, unlock }}>
          <SurfaceContext.Provider value={{ surface, setSurface, chosen: surfaceChosen }}>
          <ProfileContext.Provider value={{ memberId: profile, setMemberId: setProfile }}>
          <CalmContext.Provider value={{ calm, setCalm }}>
          <HelpContext.Provider value={{ tutorial, setTutorial }}>
            <ToastProvider>
              <ConfirmProvider>
              <AiErrorProvider>
                <AuthProvider>
                  <BrowserRouter>
                    {/* TourProvider needs the router (it navigates) + auth/audience
                        contexts; TourOverlay is rendered once here so a tour can
                        overlay ANY route, not just the hub. */}
                    <TourProvider>
                      <AppRoutes />
                      <TourOverlay />
                    </TourProvider>
                  </BrowserRouter>
                </AuthProvider>
              </AiErrorProvider>
              </ConfirmProvider>
            </ToastProvider>
          </HelpContext.Provider>
          </CalmContext.Provider>
          </ProfileContext.Provider>
          </SurfaceContext.Provider>
        </AudienceContext.Provider>
      </LangContext.Provider>
    </QueryClientProvider>
  )
}

// A little fridge-magnet note for anyone who opens the console. Calm by default —
// nothing to optimize, just a hello. 🧲
console.log(
  '%c🧲 Babillard %c— la maisonnée, en un coup d’œil · the household, at a glance',
  'font-weight:bold',
  'color:#9aa',
)

// Offline app shell for the installed PWA (wall tablet / iPad). No-op in dev.
registerSw()

// Keep --vvh/--vvt/--kb in sync with the visual viewport so modal and sheet
// action buttons stay visible above the on-screen keyboard (iOS overlays it).
trackVisualViewport()

// Ambient day-part drift (feature #1): theme-bootstrap.js set the first tint
// before paint; this keeps it current for an always-on kiosk by recomputing
// every ~10 min. No-op (and a no-op cleanup) when the operator opted out. Started
// once for the app's lifetime, so the cleanup is intentionally unused.
startDaypartDrift()

// Cold-reboot offline (NFR-OFFLINE-1): restore the last query-cache snapshot
// BEFORE first paint so a kiosk rebooted without network shows the last-known
// board/lists/recipes, then keep snapshotting. A 401 anywhere wipes it, so a
// revoked device leaves no household data behind. The await is a quick IndexedDB
// read (and a no-op when absent), so first paint isn't meaningfully delayed.
// A 401 also drops any queued offline writes — a revoked device's writes would
// never land. startOutbox replays anything left from a previous session.
onAuthLost(() => {
  clearPersistedCache()
  void clearOutbox()
  // A guest (babysitter) token that 401s is expired or revoked-by-secret-rotation
  // — drop it so the device falls back to the normal not-paired flow instead of
  // re-sending a dead token forever.
  clearGuestToken()
})
void (async () => {
  await restorePersistedCache(queryClient)
  startPersistingCache(queryClient)
  startOutbox(queryClient)
  // Realtime: only when the DO is deployed + the flag is on (see above). Fail-safe
  // either way — polling owns freshness regardless of whether the socket opens.
  if (REALTIME_ENABLED) connectRealtime(queryClient)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})()
