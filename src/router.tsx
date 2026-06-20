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
const Cercle = lazy(() => import('./pages/Cercle').then((m) => ({ default: m.Cercle })))
const CercleFormPage = lazy(() => import('./pages/CercleFormPage').then((m) => ({ default: m.CercleFormPage })))
const CercleFamilyPage = lazy(() => import('./pages/CercleFamilyPage').then((m) => ({ default: m.CercleFamilyPage })))
const Liste = lazy(() => import('./pages/Liste').then((m) => ({ default: m.Liste })))
const Pair = lazy(() => import('./pages/Pair').then((m) => ({ default: m.Pair })))
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })))
// PWA share-target landing (#13): "Share → Babillard" → capture (manifest /share).
const SharePage = lazy(() => import('./pages/SharePage').then((m) => ({ default: m.SharePage })))
// Full-screen scenes — real routes (native back, deep-linkable), rendered
// standalone (no hub chrome) because they take over the whole viewport.
const CirculairesPage = lazy(() => import('./pages/CirculairesPage').then((m) => ({ default: m.CirculairesPage })))
const CashierPage = lazy(() => import('./pages/CashierPage').then((m) => ({ default: m.CashierPage })))
const PriceMatchPage = lazy(() => import('./pages/PriceMatchPage').then((m) => ({ default: m.PriceMatchPage })))
const ListEditPage = lazy(() => import('./pages/ListEditPage').then((m) => ({ default: m.ListEditPage })))
const QuickAddPage = lazy(() => import('./pages/QuickAddPage').then((m) => ({ default: m.QuickAddPage })))
const DayPlanPage = lazy(() => import('./pages/DayPlanPage').then((m) => ({ default: m.DayPlanPage })))
const DrawingGalleryPage = lazy(() => import('./pages/DrawingGalleryPage').then((m) => ({ default: m.DrawingGalleryPage })))
const RecipeViewPage = lazy(() => import('./pages/RecipeViewPage').then((m) => ({ default: m.RecipeViewPage })))
const RecipeFormPage = lazy(() => import('./pages/RecipeFormPage').then((m) => ({ default: m.RecipeFormPage })))
const CookPage = lazy(() => import('./pages/CookPage').then((m) => ({ default: m.CookPage })))
// #43 — cook several of today's dishes at once with a shared timer rail.
const MultiCookPage = lazy(() => import('./pages/MultiCookPage').then((m) => ({ default: m.MultiCookPage })))
// #45 — the printable toddler recipe/activity book.
const RecipeBookPage = lazy(() => import('./pages/RecipeBookPage').then((m) => ({ default: m.RecipeBookPage })))
// Operator add-forms — full-screen scenes (were tall sheet forms that stranded
// inputs under the mobile keyboard). Edit still happens inline in Réglages.
const EventFormPage = lazy(() => import('./pages/EventFormPage').then((m) => ({ default: m.EventFormPage })))
const ChoreFormPage = lazy(() => import('./pages/ChoreFormPage').then((m) => ({ default: m.ChoreFormPage })))
const RoutineFormPage = lazy(() => import('./pages/RoutineFormPage').then((m) => ({ default: m.RoutineFormPage })))
// Dev-only component gallery (unlinked). A live catalogue of the shared primitives
// across the four presentation axes — see src/pages/DevKit.tsx.
const DevKit = lazy(() => import('./pages/DevKit').then((m) => ({ default: m.DevKit })))

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
          <Route path="/cercle" element={<Cercle />} />
          <Route path="/liste" element={<Liste />} />
          <Route path="/settings" element={<Operator />} />
        </Route>

        {/* Standalone surfaces (no hub chrome). */}
        <Route path="/liste/circulaires" element={<CirculairesPage />} />
        <Route path="/liste/cashier" element={<CashierPage />} />
        <Route path="/liste/quick" element={<QuickAddPage />} />
        <Route path="/liste/deals/:itemId" element={<PriceMatchPage />} />
        <Route path="/liste/item/:itemId" element={<ListEditPage />} />
        {/* One day's full meal-planning editor — a scene (was the DayManageSheet
            bottom sheet, whose lower inputs stranded under the mobile keyboard). */}
        <Route path="/kitchen/day/:date" element={<DayPlanPage />} />
        {/* #43 — cook several of today's dishes at once (shared timers). */}
        <Route path="/kitchen/cook/multi" element={<MultiCookPage />} />
        {/* #45 — the printable toddler recipe/activity book. */}
        <Route path="/kitchen/book" element={<RecipeBookPage />} />
        {/* `new` before `:id` so it isn't captured as a recipe id. */}
        <Route path="/kitchen/recipe/new" element={<RecipeFormPage />} />
        <Route path="/kitchen/recipe/:id" element={<RecipeViewPage />} />
        <Route path="/kitchen/recipe/:id/edit" element={<RecipeFormPage />} />
        <Route path="/kitchen/recipe/:id/cook" element={<CookPage />} />
        {/* Family builder — define a whole family's relationships at once. */}
        <Route path="/cercle/family/new" element={<CercleFamilyPage />} />
        <Route path="/cercle/family/:groupId" element={<CercleFamilyPage />} />
        {/* `new` before `:id` so it isn't captured as a contact id. */}
        <Route path="/cercle/person/new" element={<CercleFormPage />} />
        <Route path="/cercle/person/:id" element={<CercleFormPage />} />
        <Route path="/event/new" element={<EventFormPage />} />
        <Route path="/chore/new" element={<ChoreFormPage />} />
        <Route path="/routine/new" element={<RoutineFormPage />} />
        <Route path="/routine/:id" element={<RoutineFormPage />} />
        {/* The drawing collection / gallery — "Mes dessins" (#14). */}
        <Route path="/drawings" element={<DrawingGalleryPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/pair" element={<Pair />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Dev-only component gallery — unlinked, standalone (no hub chrome). */}
        <Route path="/dev/kit" element={<DevKit />} />

        {/* Legacy: kid view folded into Routines-in-toddler-mode. */}
        <Route path="/kid" element={<Navigate to="/routines" replace />} />

        <Route path="*" element={<Entry />} />
      </Routes>
    </Suspense>
  )
}
