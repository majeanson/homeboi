import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Home } from './pages/Home'
import { useT } from './i18n'
import { useSurface } from './lib/surface'
import { useAuth } from './lib/auth'
import { isPaired } from './lib/device'

// Hot paths eager (Home, Board — the kiosk surfaces a tablet hits on boot).
// Everything else is lazy. The six themed tabs render inside HubLayout, which
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
const CerclePetPage = lazy(() => import('./pages/CerclePetPage').then((m) => ({ default: m.CerclePetPage })))
const CercleCarnetPage = lazy(() => import('./pages/CercleCarnetPage').then((m) => ({ default: m.CercleCarnetPage })))
const CercleWorldPage = lazy(() => import('./pages/CercleWorldPage').then((m) => ({ default: m.CercleWorldPage })))
// « Ajouter une famille » — the recipient side of « Partager une famille »: a shared
// family link (/cercle/import?s=<id>) lands here to preview + merge into your cercle.
const FamilyImportPage = lazy(() => import('./pages/FamilyImportPage').then((m) => ({ default: m.FamilyImportPage })))
const JouerPage = lazy(() => import('./pages/JouerPage').then((m) => ({ default: m.JouerPage })))
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
// « Moments » — a read-only recap of a chosen time window (tonight / tomorrow / a
// picked date / this week), with each day's « À compléter » handoff checklist inline.
const MomentScene = lazy(() => import('./pages/MomentScene').then((m) => ({ default: m.MomentScene })))
const DrawingGalleryPage = lazy(() => import('./pages/DrawingGalleryPage').then((m) => ({ default: m.DrawingGalleryPage })))
const RecipeViewPage = lazy(() => import('./pages/RecipeViewPage').then((m) => ({ default: m.RecipeViewPage })))
const RecipeFormPage = lazy(() => import('./pages/RecipeFormPage').then((m) => ({ default: m.RecipeFormPage })))
const CookPage = lazy(() => import('./pages/CookPage').then((m) => ({ default: m.CookPage })))
// #43 — cook several of today's dishes at once with a shared timer rail.
const MultiCookPage = lazy(() => import('./pages/MultiCookPage').then((m) => ({ default: m.MultiCookPage })))
// #45 — the printable toddler recipe/activity book.
const RecipeBookPage = lazy(() => import('./pages/RecipeBookPage').then((m) => ({ default: m.RecipeBookPage })))
// #30 — global search across recipes / people / events / the list.
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })))
// #17 — departure mode: a leaving-the-house checklist + today's events + weather.
const DeparturePage = lazy(() => import('./pages/DeparturePage').then((m) => ({ default: m.DeparturePage })))
// #34 / #35 — typed read-only share links land here (standalone, no hub chrome):
// a babysitter "handoff" card and a visitor "welcome" card. See lib/auth GuestKind.
const HandoffPage = lazy(() => import('./pages/HandoffPage').then((m) => ({ default: m.HandoffPage })))
const WelcomePage = lazy(() => import('./pages/WelcomePage').then((m) => ({ default: m.WelcomePage })))
// #36 — the grandparents' window: kids' upcoming dates + birthdays + latest photos.
const FamilyWindowPage = lazy(() => import('./pages/FamilyWindowPage').then((m) => ({ default: m.FamilyWindowPage })))
// Family-info intake: a relative fills their own card + household via an 'intake'
// share link; the operator reviews + merges it into Le cercle. See lib/auth GuestKind.
const IntakeForm = lazy(() => import('./pages/IntakeForm').then((m) => ({ default: m.IntakeForm })))
// « La boîte aux lettres » — a relative's 'postbox' share link lands here: name
// yourself + leave a message (word / voice / drawing / photo) → quarantined → the
// operator accepts it into a board fridge note. See lib/device GuestKind.
const Postbox = lazy(() => import('./pages/Postbox').then((m) => ({ default: m.Postbox })))
const VoiturePage = lazy(() => import('./pages/VoiturePage').then((m) => ({ default: m.VoiturePage })))
// « Voyage » — the trip notebook (Carnet de voyage): a full-screen scene with the
// Itinéraire / Infos / Bagages / Documents sub-tabs. Standalone (no hub chrome).
const VoyagePage = lazy(() => import('./pages/VoyagePage').then((m) => ({ default: m.VoyagePage })))
// « Voyage partagé » — the cross-household shared trip scene + its invite-link landing.
const SharedVoyagePage = lazy(() => import('./pages/SharedVoyagePage').then((m) => ({ default: m.SharedVoyagePage })))
const SharedVoyageJoinPage = lazy(() => import('./pages/SharedVoyageJoinPage').then((m) => ({ default: m.SharedVoyageJoinPage })))
// « Diffuser au salon » — the living-room TV board: the real board, read-only +
// scaled, shown on a TV via Chromecast. Standalone (no hub chrome).
const CastPage = lazy(() => import('./pages/CastPage').then((m) => ({ default: m.CastPage })))
// Operator add-forms — full-screen scenes (were tall sheet forms that stranded
// inputs under the mobile keyboard). Edit still happens inline in Réglages.
const EventFormPage = lazy(() => import('./pages/EventFormPage').then((m) => ({ default: m.EventFormPage })))
const ChoreFormPage = lazy(() => import('./pages/ChoreFormPage').then((m) => ({ default: m.ChoreFormPage })))
// Projets / Entretien (home_projects) add-form — the board ＋ « Corvées » sub-choice.
const HomeProjectFormPage = lazy(() => import('./pages/HomeProjectFormPage').then((m) => ({ default: m.HomeProjectFormPage })))
const RoutineFormPage = lazy(() => import('./pages/RoutineFormPage').then((m) => ({ default: m.RoutineFormPage })))
// Run a routine on any surface (parent phone, kiosk) — the shared player as a scene.
const RoutineRunPage = lazy(() => import('./pages/RoutineRunPage').then((m) => ({ default: m.RoutineRunPage })))
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
        <Route path="/cercle/pet/new" element={<CerclePetPage />} />
        <Route path="/cercle/pet/:id" element={<CerclePetPage />} />
        <Route path="/cercle/carnet/:id" element={<CercleCarnetPage />} />
        {/* « Notre monde » — the big-picture overview map (full-screen scene). */}
        <Route path="/cercle/monde" element={<CercleWorldPage />} />
        {/* « Ajouter une famille » — a shared-family link lands here (?s=<id>). */}
        <Route path="/cercle/import" element={<FamilyImportPage />} />
        {/* « Jouer » — the toddler play space (full-screen scene). */}
        <Route path="/jouer" element={<JouerPage />} />
        <Route path="/event/new" element={<EventFormPage />} />
        <Route path="/chore/new" element={<ChoreFormPage />} />
        <Route path="/home-project/new" element={<HomeProjectFormPage />} />
        <Route path="/routine/new" element={<RoutineFormPage />} />
        <Route path="/routine/:id" element={<RoutineFormPage />} />
        {/* Run a routine standalone (the ▶ on the Routines tab / the peek action). */}
        <Route path="/routine/:id/run" element={<RoutineRunPage />} />
        {/* The drawing collection / gallery — "Mes dessins" (#14). */}
        <Route path="/drawings" element={<DrawingGalleryPage />} />
        {/* #30 — global search, reachable from every hub tab's header. */}
        <Route path="/search" element={<SearchPage />} />
        {/* #17 — departure mode (board ＋ ▸ Avant de partir). */}
        <Route path="/board/departure" element={<DeparturePage />} />
        {/* #34 / #35 / #36 — typed share-link landings (sitter / visitor / family). */}
        <Route path="/handoff" element={<HandoffPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/family" element={<FamilyWindowPage />} />
        {/* Family-info intake form — a relative's 'intake' share link lands here. */}
        <Route path="/intake" element={<IntakeForm />} />
        {/* « La boîte aux lettres » — a relative's 'postbox' share link lands here. */}
        <Route path="/courrier" element={<Postbox />} />
        {/* #28 — « L'auto » week view (single-car + carpool + work schedules). */}
        <Route path="/voiture" element={<VoiturePage />} />
        {/* « Voyage partagé » — the invite-link landing + the shared trip scene. Both
            static/prefixed segments sit BEFORE the private `/voyage/:id` so `rejoindre`
            and `partage` aren't captured as trip ids (the `new`-before-`:id` precedent). */}
        <Route path="/voyage/rejoindre" element={<SharedVoyageJoinPage />} />
        <Route path="/voyage/partage/:id" element={<SharedVoyagePage />} />
        {/* « Voyage » — the trip notebook. `new` before `:id` so it isn't an id. */}
        <Route path="/voyage/new" element={<VoyagePage />} />
        <Route path="/voyage/:id" element={<VoyagePage />} />
        {/* « Diffuser au salon » — the read-only living-room TV board (cast to a TV). */}
        <Route path="/cast" element={<CastPage />} />
        {/* « Moments » — pick a window (tonight / tomorrow / date / week) → its recap
            + handoff checklist. ?scope= deep-links a preset (the dusk board card uses it). */}
        <Route path="/moment" element={<MomentScene />} />
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
