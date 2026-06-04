import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Home } from './pages/Home'
import { useT } from './i18n'

// Hot paths eager (Home, Board — the kiosk surfaces a tablet hits on boot).
// Everything else is lazy. The five themed tabs render inside HubLayout, which
// owns the chrome + tab bar + the Parent/Toddler audience switch.
import { HubLayout } from './components/HubLayout'
import { Board } from './pages/Board'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Operator = lazy(() => import('./pages/Operator').then((m) => ({ default: m.Operator })))
const Kitchen = lazy(() => import('./pages/Kitchen').then((m) => ({ default: m.Kitchen })))
const Routines = lazy(() => import('./pages/Routines').then((m) => ({ default: m.Routines })))
const Liste = lazy(() => import('./pages/Liste').then((m) => ({ default: m.Liste })))
const Pair = lazy(() => import('./pages/Pair').then((m) => ({ default: m.Pair })))

function Loading() {
  const t = useT()
  return <p className="loading mono">{t.common.loading}</p>
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />

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

        {/* Legacy: kid view folded into Routines-in-toddler-mode. */}
        <Route path="/kid" element={<Navigate to="/routines" replace />} />

        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  )
}
