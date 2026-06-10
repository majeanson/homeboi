import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Home } from './pages/Home'
import { useT } from './i18n'
import { useSurface } from './lib/surface'
import { useAuth } from './lib/auth'
import { isPaired } from './lib/device'

// Hot paths eager (Home, Board — the kiosk surfaces a tablet hits on boot).
// Everything else is lazy. The five themed tabs render inside HubLayout, which
// owns the chrome + tab bar + the Parent/Toddler audience switch.
import { HubLayout } from './components/HubLayout'
import { Board } from './pages/Board'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })))
const Operator = lazy(() => import('./pages/Operator').then((m) => ({ default: m.Operator })))
const Kitchen = lazy(() => import('./pages/Kitchen').then((m) => ({ default: m.Kitchen })))
const Routines = lazy(() => import('./pages/Routines').then((m) => ({ default: m.Routines })))
const Liste = lazy(() => import('./pages/Liste').then((m) => ({ default: m.Liste })))
const Pair = lazy(() => import('./pages/Pair').then((m) => ({ default: m.Pair })))
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })))

function Loading() {
  const t = useT()
  return <p className="loading mono">{t.common.loading}</p>
}

// The smart front door. A first-time visitor — no device role chosen, not paired,
// not signed in — gets the marketing page. Everyone else (a returning kiosk, a
// returning phone) skips straight to their home (/board renders per surface). We
// only wait on the auth check when it's the deciding factor; a chosen/paired
// device redirects without blocking on it.
function Entry() {
  const { chosen } = useSurface()
  const { signedIn, loading } = useAuth()
  if (chosen || isPaired()) return <Navigate to="/board" replace />
  if (loading) return <Loading />
  if (signedIn) return <Navigate to="/board" replace />
  return <Home />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Entry />} />
        <Route path="/setup" element={<Setup />} />

        {/* The hub: themed tabs, each rendered for the current audience. */}
        <Route element={<HubLayout />}>
          <Route path="/board" element={<Board />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/liste" element={<Liste />} />
          <Route path="/settings" element={<Operator />} />
        </Route>

        {/* Standalone surfaces (no hub chrome). */}
        <Route path="/pair" element={<Pair />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Legacy: kid view folded into Routines-in-toddler-mode. */}
        <Route path="/kid" element={<Navigate to="/routines" replace />} />

        <Route path="*" element={<Entry />} />
      </Routes>
    </Suspense>
  )
}
