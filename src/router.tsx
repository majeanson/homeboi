import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { useT } from './i18n'

// Hot paths eager (Home, Board, Pair — the kiosk surfaces a tablet hits on
// boot). Everything operator-facing is lazy.
import { Board } from './pages/Board'
import { Pair } from './pages/Pair'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Operator = lazy(() => import('./pages/Operator').then((m) => ({ default: m.Operator })))
const Kitchen = lazy(() => import('./pages/Kitchen').then((m) => ({ default: m.Kitchen })))
const KidView = lazy(() => import('./pages/KidView').then((m) => ({ default: m.KidView })))

function Loading() {
  const t = useT()
  return <p className="loading mono">{t.common.loading}</p>
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board" element={<Board />} />
        <Route path="/kid" element={<KidView />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/pair" element={<Pair />} />
        <Route path="/login" element={<Login />} />
        <Route path="/settings" element={<Operator />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  )
}
