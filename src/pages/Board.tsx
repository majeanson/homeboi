import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PairPrompt } from '../components/Fallback'
import { HubHead } from '../components/HubHead'
import { WelcomeCard } from '../components/WelcomeCard'
import { SampleBanner } from '../components/SampleBanner'
import { AutoCard } from '../components/board/AutoCard'
import { CarnetsCard } from '../components/board/CarnetsCard'
import { HabitudesCard } from '../components/board/HabitudesCard'
import { CercleNotesCard } from '../components/board/CercleNotesCard'
import { VoyageCard } from '../components/board/VoyageCard'
import { SeasonUpkeepCard } from '../components/board/SeasonUpkeepCard'
import { RoutineNextCard } from '../components/board/RoutineNextCard'
import { MomentPeek } from '../components/board/MomentPeek'
import { ARegler } from '../components/board/ARegler'
import { MotsCard } from '../components/mots/MotsCard'
import { DayHeroes } from '../components/board/DayHeroes'
import { Icon, InlineIcon } from '../components/Icon'
import { TOD_ICON } from '../lib/cats'
import { useMealPrefs } from '../lib/mealPrefs'
import { useNextMeal } from '../lib/nextMeal'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useEventPeekActions } from '../components/detail/EventPeekActions'
import { useSurface } from '../lib/surface'
import { useProfile } from '../lib/profile'
import { ProfilePicker } from '../components/ProfilePicker'
import { readBoardView, saveBoardView, type BoardView } from '../lib/boardview'
import { timeOfDay } from '../lib/timeofday'
import { isDaypartAuto } from '../lib/theme'
import { momentFocus } from '../lib/momentFocus'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { weatherIcon, weatherTint, type Weather, type DayOutlook, type HourOutlook } from '../lib/weather'
import { formatDay, formatDayMaybeYear, formatTime, weekdayShort } from '../lib/format'
import { todayLocalDay, addLocalDays, daysUntilLocal } from '../lib/localDay'
import { useNow, isPastSec } from '../lib/itemLife'
import { imgUrl } from '../lib/image'
import { SLOT_ICON_NAME, heroCardLabel, slotLabel as slotLabelFor, type MealSlot } from '../lib/mealSlots'
import { Act, Section } from '../components/board/Act'
import { type CompactRow } from '../components/board/BoardCard'
import { Disclosure } from '../components/Disclosure'
import { Fil } from '../components/board/Fil'
import { PhotoFrame } from '../components/board/PhotoFrame'
import { BoardCanvas } from '../components/board/BoardCanvas'
import { WonderBand, useWonder } from '../components/board/ApodFrame'
import { Notes } from '../components/board/Notes'
import { DayNote } from '../components/board/DayNote'
import { BoardViewToggle, MemberSwitcher } from '../components/board/chrome'
import { MonthView } from '../components/board/MonthView'
import { YearView } from '../components/board/YearView'
import { nameOf, colorOf, type ChoreInstance, type EventRow, type MealRow, type WorkRow } from '../components/board/types'
import { SimpleBoard } from '../components/board/SimpleBoard'
import { ToddlerBoard } from '../components/board/ToddlerBoard'
import { CountdownCard } from '../components/board/CountdownCard'
import { TodayChangesSheet } from '../components/board/TodayChangesSheet'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildEvent, buildChore, buildLeftover, type DetailCtx } from '../components/detail/adapters'
import { useOpenMeal } from '../components/detail/useOpenMeal'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { useBoardData } from '../lib/queryHooks'
import { useHolidaysEnabled, useSchoolYear } from '../lib/year'
import { useChoreAnnounceEnabled } from '../lib/choreAnnounce'
import { useBoardModel } from '../lib/boardModel'
import { useCarnets, carnetEmoji } from '../lib/carnets'
import {
  useBoardCards,
  visibleCards,
  isCardVisible,
  cardMeta,
  cardMode,
  moveCard,
  setCardPrefs,
  parseZoneKey,
  BOARD_CARDS,
  type BoardCardId,
  type BoardCardPrefs,
} from '../lib/boardCards'
import { WidgetGrid } from '../components/board/WidgetGrid'
import { CardSlot } from '../components/board/CardSlot'
import { usePointerDnd, DragGhost } from '../lib/dnd'
import { useLongPress } from '../lib/useLongPress'
import { useTabParam } from '../lib/tabParam'
import { useEscapeKey } from '../lib/sceneNav'

// The wall board. Polls the whole board in one read on an interval. ZERO AI on
// this path. Tolerates wifi loss: a failed poll keeps the last good frame and
// flips a "showing cache" stamp instead of blanking. The day's list empties
// and stays empty — no counters, no score for clearing it. The board has two
// glances — « Grille » (this file) and « Mois » (MonthView) — with the face picker
// as the per-person lens; the card/section atoms live in src/components/board/*.
import { BOARD_KEY, TODOS_KEY, WEATHER_KEY } from '../lib/queryKeys'
import { TodoSection } from '../components/todos/TodoSection'
import { type TodosData, todosKey, todosPath } from '../lib/todos'
import { useUndoToast, useRecordUndo } from '../lib/toast'
import { isGuest, isDisplay } from '../lib/device'
import { Cluster } from '../components/Layout'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { BOARD_HELP } from '../lib/boardHelp'

// The shared past/now rule lives in lib/itemLife (mealSlotPast / isPastSec / useNow), so
// every timed board item — meals, rendez-vous, work — crosses out by ONE rule on ONE
// clock. A meal's threshold comes from the household's serve hours (Réglages ▸ Repas).

// Keep the greeting on one line beside the help dot + section icon: a long
// display name collapses so "Bonne soirée, …" never wraps or overflows. A
// MULTI-word name → its initials ("Marie-Christine" → "MC"); a single long
// first name ("Alexandrina") would collapse to a lone "A", which reads oddly,
// so it's truncated with an ellipsis instead.
const greetName = (name: string) => {
  if (name.length <= 10) return name
  const parts = name.split(/[\s-]+/).filter(Boolean)
  if (parts.length > 1) return parts.map((p) => p[0]!.toUpperCase()).join('')
  return name.slice(0, 9) + '…'
}

// Emptiness for a LENS-built card: the board already holds these rows, so a `null` node
// means "nothing to show today" (« Le fil » isn't eligible, « Demain » is bare, the day is
// clear). `undefined` instead defers to the card's own `useReportEmpty` — which is the
// only thing a self-fetching card can do, since it learns it's empty after it fetches.
const slotEmpty = (node: ReactNode): boolean | undefined => (node == null ? true : undefined)

// A quiet running clock for the active board header (glanceability): a wall
// tablet whose content is all time-relative ("ce soir", struck-through past
// meals) should still answer "what time is it?" from across the room. Calm by
// design — minute granularity, no second hand, locale time (FR-CA 24 h) via the
// shared `formatTime`. Kept as its own subcomponent so the per-minute tick
// re-renders only this label, never the whole board.
function BoardClock() {
  const { lang } = useLang()
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 60_000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="board-controls__clock mono" aria-hidden="true">
      {formatTime(nowSec, lang)}
    </span>
  )
}

export function Board() {
  const t = useT()
  const undo = useUndoToast()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  const qc = useQueryClient()
  const ro = isGuest()
  const { lang } = useLang()
  const { audience } = useAudience()
  // Modify / Delete / Share for an event peek — gating + both modals owned by the hook.
  const eventActions = useEventPeekActions()
  const { surface } = useSurface()
  // Pick-your-face: who's on this phone — greets them + marks their day.
  const { memberId: profileId, setMemberId } = useProfile()
  const [profileOpen, setProfileOpen] = useState(false)
  // « Depuis ce matin » (A-3) — the greeting doubles as a pull-only peek trigger.
  const [sinceMorningOpen, setSinceMorningOpen] = useState(false)
  // The shared entity-detail peek (lib/detail) — tap a row to see picture/date/text
  // + smart actions. Parent audience only; the toddler lens stays hear-first below.
  const detail = useEntityDetail()
  // Resolves a tapped meal → its saved recipe, so the tap can jump straight to it.
  const recipeFor = useRecipeForMeal()
  // The board layout for this device (bento = Grille | month = Mois), remembered locally.
  const [view, setView] = useState<BoardView>(() => readBoardView())
  // Which Grille cards this device shows + their order (Réglages ▸ Affichage ▸
  // Disposition). Per-device, live via useSyncExternalStore (lib/boardCards).
  const boardCards = useBoardCards()
  // Contextual "?" help for the view toggle (lib/helpMode): arm it, tap a view to
  // learn what it shows instead of switching. Label = the view's own name.
  const help = useHelpMode(BOARD_HELP, (k) => {
    if (k.startsWith('view-')) return t.boardView[k.slice(5) as 'bento' | 'month' | 'annee']
    const titles: Record<string, string> = {
      todos: t.board.todos,
      today: t.board.today,
      fil: t.board.fil,
      toFinish: t.board.toFinish,
      upcoming: t.board.upcoming,
      search: t.search.title,
      mots: t.mots.cardTitle,
    }
    return titles[k] ?? k
  })
  // The shared minute clock (lib/itemLife): re-renders the board every minute so past
  // strike-throughs, « Bientôt » chips and the day-part drift advance on their own, not
  // only when a poll lands. Used by every time-derived value below.
  const nowMs = useNow()
  // Re-bucket today→tomorrow at LOCAL midnight even on a left-on wall tablet. The server
  // buckets the payload by local day, so the client can't re-split its arrays itself; when
  // the local day flips, refetch. The minute clock drives the check.
  const dayRef = useRef(todayLocalDay())
  useEffect(() => {
    const d = todayLocalDay()
    if (d !== dayRef.current) {
      dayRef.current = d
      qc.invalidateQueries({ queryKey: BOARD_KEY })
    }
  }, [nowMs, qc])
  // Chores/todos whose "done" PATCH is DEFERRED behind the undo toast. Filtered
  // out of the rendered board at once so the live poll can't resurrect them before
  // the write commits — same guard as Liste's pendingClear. Tapping Annuler means
  // the completion simply never happens (no rotation advance, no credit).
  const [pendingDone, setPendingDone] = useState<Set<string>>(new Set())
  // Leftovers marked "Fini" from the board, held behind the undo toast — filtered
  // out of the rendered reminder at once so the live poll can't resurrect them
  // before the delete commits (same guard as pendingDone).
  const [pendingLeftover, setPendingLeftover] = useState<Set<string>>(new Set())
  // « L'année » → « Mois » drill-down: a tapped mini-month lands the Mois view on
  // that month. Transient navigation — the toggle resets it and it isn't saved,
  // so a reload still opens the device's chosen view.
  const [monthJump, setMonthJump] = useState(0)
  function changeView(v: BoardView) {
    setMonthJump(0)
    setView(v)
    saveBoardView(v)
  }

  // The whole board in one live read (see `live` in lib/query: polls + refetches
  // on focus so another phone's change lands here within a tick). TanStack keeps
  // the last good frame when a poll fails, so on wifi loss we keep rendering it
  // and just flip the "offline" stamp. retry:false overrides the default → the
  // stale stamp appears promptly and the next poll recovers.
  const { data, error, isError } = useBoardData({ retry: false })
  // « Les carnets » — map a carnet id → its thing, so a carnet-scoped Entretien row on
  // the board reads with its thing's emoji (🔥 Chauffe-eau · filtre) while staying
  // checkable in place. `live: false` shares the board card's non-polling observer (one
  // /api/carnets fetch, off the poll cadence — the free-tier lever).
  const { data: carnetsData } = useCarnets({ live: false })
  const carnetById = new Map((carnetsData?.carnets ?? []).map((x) => [x.id, x]))
  const unauth = isUnauthorized(error)
  const stale = isError && !unauth && !!data

  // Weather is its own slow poll (15 min) off the render-critical board read, and
  // resolves to null when there's no postal / upstream is down → the chip hides.
  const FIFTEEN_MIN = 15 * 60 * 1000
  const { data: wx } = useQuery({
    queryKey: WEATHER_KEY,
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null; hours: HourOutlook[] | null }>('weather'),
    refetchInterval: FIFTEEN_MIN,
    staleTime: FIFTEEN_MIN,
  })
  const weather = wx?.weather ?? null
  const tomorrowWx = wx?.tomorrow ?? null
  const wxHours = wx?.hours ?? null
  // The daily-wonder picture (Bing / Wikipedia / NASA…) — used as the BACKDROP of
  // the weather card so the glance is a beautiful photo with the temperature read
  // clearly on top. Keeps its own last-good-frame + shuffle (lib ApodFrame).
  const { wonder, shuffle: shuffleWonder } = useWonder()

  // À compléter (todos, migration 0046) — its own light poll, separate from the
  // loose-chore "À faire" the board payload already carries (data.todos). The
  // parent grid renders the full <TodoSection>; this read backs the toddler tiles
  // + the "all clear" check. Open-only for the read-aloud kid view.
  const { data: todosData } = useQuery({ queryKey: TODOS_KEY, queryFn: () => api<TodosData>('todos'), ...live })
  const openTodos = (todosData?.todos ?? []).filter((td) => td.done_at == null)

  // Tomorrow's per-day À compléter todos — surfaced inside the Demain card so a
  // checklist pinned to tomorrow is visible there too. The À compléter card itself
  // stays global + today; this is the same data the day page shows, just glanced on
  // the board. Shares TODOS_KEY's prefix, so a write/realtime invalidate refreshes
  // it; TanStack dedupes the fetch with the embedded <TodoSection> below.
  const tomorrowTodoDay = addLocalDays(todayLocalDay(), 1)
  const { data: tomorrowTodosData } = useQuery({
    queryKey: todosKey(tomorrowTodoDay),
    queryFn: () => api<TodosData>(todosPath(tomorrowTodoDay)),
    ...live,
  })
  const tomorrowTodoCount = (tomorrowTodosData?.todos ?? []).length

  // (The kiosk's idle drift back to Maisonnée lives in HubLayout — shell-level,
  // so wandering to Réglages or the kitchen doesn't pin a picked face forever.)

  // A member deleted in Réglages can linger as this device's picked profile —
  // clear it so the greeting/"my day" accents never point at a ghost.
  useEffect(() => {
    if (profileId && data?.members && !data.members.some((m) => m.id === profileId)) setMemberId(null)
  }, [data?.members, profileId, setMemberId])

  const memberName = (id: string | null) => nameOf(data?.members ?? [], id)
  const memberColor = (id: string | null) => colorOf(data?.members ?? [], id)
  const slotLabel = (slot: string) => slotLabelFor(slot, t)
  // Per-slot meal colour + visibility (Réglages ▸ Repas). A meal's slot tints its
  // card here and everywhere it shows; a hidden slot drops off the glance.
  const mealPrefs = useMealPrefs()
  // The day's HERO meal — the souper unless the household promoted another slot.
  // « Préparer le repas » — the next meal due that resolves to a recipe → its cook
  // mode (or the picker when it's free-text). Reused from the retired « Maintenant »
  // view: a quick action beside « Prochainement », never a dead end (a planned
  // leftover has nothing to cook, so the CTA hides for it).
  const cook = useNextMeal()
  const nav = useNavigate()
  // "La galerie" door, shown in the Grille view. It rides as a small trailing
  // chip inside the drawings strip (beside the photos on tablet, under them on
  // mobile) so it never claims its own row; when there are no drawings yet it
  // still appears so saved gallery drawings stay reachable.
  const galleryLink = (
    <Link to="/drawings" className="chip"><InlineIcon name="paint-brush-bold" /> {t.memo.galleryLink}</Link>
  )

  // A-2 (bmad/09): les fêtes QC/CA — DERIVED on-device (lib/year, the D-16
  // layer; no rows, no fetch) and merged into the same event arrays every lens
  // reads (parent, toddler, simple, fil). Calm zero-impact announce lines:
  // all-day, nobody's, never editable — the emoji is the picture. All shown by
  // default; per-device opt-out in Réglages ▸ Affichage (Marc's OQ-4 verdict).
  const fetesOn = useHolidaysEnabled()
  // D-21: per-device opt-out for the flagged-chore "evening before" announce
  // line — same wiring as fetesOn above (lib/choreAnnounce).
  const binAnnounceOn = useChoreAnnounceEnabled()
  // D-17: the household's school-year bounds (Réglages ▸ Le babillard) — read
  // once here and passed through the model, so all three lenses agree.
  const schoolYear = useSchoolYear()

  // C-12 (bmad/10) — the ONE pure board view-model (lib/boardModel): merges
  // fêtes, applies the face lens, filters pending-undo rows, gates meal slots
  // by visibility, and derives nextUp/fil/dayClear/kidAllClear/hasTomorrow on
  // its own shared clock. Every other input (mealPrefs, the picked face, the
  // fêtes toggle…) is passed through AS-IS, never re-derived here.
  const model = useBoardModel({
    data,
    lang,
    profileId,
    fetesOn,
    binAnnounceOn,
    mealPrefs,
    schoolYear,
    pendingDone,
    pendingLeftover,
    hasWeather: !!weather,
    hasTomorrowWx: !!tomorrowWx,
    openTodosCount: openTodos.length,
    tomorrowTodoCount,
  })
  // The day's hero slot as the MODEL resolved it (off the board payload, not off the
  // household setting directly) — so « Ce soir »'s icon, label, colour and its meals
  // always describe the same slot, even in the poll right after the hero is changed.
  const heroSlot = model.meals.hero
  const supperColor = mealPrefs.color(heroSlot)
  // Aliases onto the model's output, kept under their old names so the JSX
  // below reads them the same way it always did — the derivations themselves
  // now live in ONE place (lib/boardModel), not re-implemented per lens.
  const todayEvents = model.today.events
  const todayChores = model.today.chores
  const todayTodos = model.today.todos
  const todayHome = model.today.home
  const tomorrowEvents = model.tomorrow.events
  const upcomingEvents = model.upcoming.events
  const upcomingChores = model.upcoming.chores
  const upcomingHome = model.upcoming.home
  const leftovers = model.leftovers
  const otherMeals = model.meals.otherToday
  const otherTomorrowMeals = model.meals.otherTomorrow
  const tonightMeals = model.meals.tonightAll
  const showTomorrowSupper = !!model.meals.tomorrowSupper
  const nextUpToday = model.nextUp
  const filTimed = model.fil.timed
  const filUntimed = model.fil.untimed
  const filWork = model.fil.work
  const filShown = isCardVisible(boardCards, 'fil') && model.fil.eligible
  const dayClear = model.dayClear
  const hasTomorrow = model.hasTomorrow
  // Time-aware emphasis (lib/momentFocus): the board gently leans toward what matters now —
  // the day ahead in the morning, the supper hero as dinner nears, « Demain » prep in the
  // evening. Folded under the ambient toggle (Réglages ▸ Affichage): ambient on → the board
  // also leans by time; off → no emphasis. A soft accent, never a reshuffle.
  const focus = isDaypartAuto() ? momentFocus(Date.now(), mealPrefs.hours[heroSlot]) : null
  const filNow = focus === 'day' && filShown
  const todayNow = (focus === 'day' && !filShown) || focus === 'evening'

  // What the adapters (components/detail/adapters) need to resolve faces + copy.
  // recipeFor lets a tapped meal jump straight to its recipe view (useOpenMeal).
  // BOTH must sit ABOVE the early returns below: `useOpenMeal` is a hook, and the
  // unauth / simple / toddler paths bail out before the rest of the render — calling
  // it after them changes Board's hook count between renders (Rules of Hooks).
  const detailCtx: DetailCtx = { t, lang, members: data?.members ?? [], recipeFor }
  // A tapped meal → its recipe view when it has one, else the plan peek.
  const openMeal = useOpenMeal(detailCtx)

  // ── Edit mode: hold a card to rearrange the board ──────────────────────────────────
  // ABOVE the lens early-returns, for the same Rules-of-Hooks reason spelled out above:
  // the toddler/simple/unauth branches bail out below, and a hook placed after them makes
  // Board's hook count depend on the lens.
  //
  // State lives in the URL so Réglages ▸ Disposition can deep-link into it (/board?edit=1)
  // and so a remount (a scene closing over the board) doesn't drop you out of it.
  const [editParam, setEditParam] = useTabParam<'0' | '1'>('edit', '0', ['0', '1'])
  // Who may rearrange: not a cast display (which renders this very Board on a TV, with no
  // pointer to hold), and only the parent lens — a toddler's press belongs to tap-to-hear,
  // and the simple lens has no cards to drag.
  //
  // A read-only guest MAY rearrange. The layout is a per-device localStorage store
  // (lib/boardCards); dragging a card writes nothing to the server and changes nothing for
  // the household — so `ro` has no business here, and gating on it is what left the public
  // demo unable to touch the one feature that best shows off the widget space. See the note
  // on isGuest() in lib/device.
  const canEdit = !isDisplay() && audience === 'parent'
  const editing = canEdit && editParam === '1'
  const exitEdit = useCallback(() => setEditParam('0'), [setEditParam])

  // « Annuler » — edit mode is otherwise apply-as-you-go (every drag / ✕ / resize
  // writes the device store immediately), so the only way out WITHOUT keeping the
  // changes used to be force-quitting the app. Arming edit mode snapshots the layout
  // as it was; Annuler writes that snapshot back and leaves. The ref pair keeps the
  // arm-effect off the per-change render path (it must capture once per session, not
  // re-capture after every tweak).
  const editSnapshot = useRef<BoardCardPrefs | null>(null)
  const prefsNow = useRef(boardCards)
  prefsNow.current = boardCards
  useEffect(() => {
    if (editing) editSnapshot.current = prefsNow.current
  }, [editing])
  const revertEdit = useCallback(() => {
    if (editSnapshot.current) setCardPrefs(editSnapshot.current)
    exitEdit()
  }, [exitEdit])

  useLongPress({
    targets: '.wg-slot',
    enabled: canEdit && !editing,
    onLongPress: () => setEditParam('1'),
  })
  useEscapeKey(exitEdit, editing)

  // ONE drag session across BOTH zones — that is what makes dragging a card out of the
  // band and into the masonry a single gesture rather than two systems.
  const cardDnd = usePointerDnd({
    onDrop: (cardId, dropKey) => {
      const target = parseZoneKey(dropKey)
      if (!target || !cardMeta(cardId as BoardCardId)) return
      // A drop on a slot inserts BEFORE that card; a drop on the grid's trailing space
      // appends. Never an index — dragging DOWN would land one slot too far, because
      // removing the dragged card first shifts every later index left by one.
      setCardPrefs(moveCard(boardCards, cardId as BoardCardId, target.zone, target.before))
    },
  })

  // ── Compact lens: in-place growth (Phase 3) ─────────────────────────────────────────
  // ABOVE the lens early-returns for the same Rules-of-Hooks reason as the edit-mode
  // block above. Single-open ACROSS BOTH zones — lifted here (not per-WidgetGrid state)
  // and threaded into both mounts below, the same trick `cardDnd` uses for one drag
  // session spanning the band and the masonry. Transient only: no localStorage, resets
  // on reload, and collapses the instant edit mode arms (below).
  const [expandedId, setExpandedId] = useState<BoardCardId | null>(null)
  const expandCard = useCallback((id: BoardCardId) => setExpandedId(id), [])
  const collapseCard = useCallback(() => setExpandedId(null), [])
  useEffect(() => {
    if (editing) setExpandedId(null)
  }, [editing])

  if (unauth) return <PairPrompt />

  // The picked member on this device (greeting + "your day" emphasis, both
  // lenses). Null on a shared kiosk with nobody picked.
  const me = data?.members.find((m) => m.id === profileId) ?? null

  // « Simple » lens (bmad/08 A-1) — the post-reader/grandma board: four giant
  // calm zones (Aujourd'hui · Souper · La liste · Notes) off the SAME data. The
  // other tabs inherit the parent views; only the board gets this bespoke glance.
  if (audience === 'simple') {
    const tod = timeOfDay(nowMs)
    const greet = me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]
    return <SimpleBoard data={data} model={model} greet={greet} />
  }

  // Toddler lens (`ToddlerBoard.tsx`, C-12 6/6, bmad/10) — same board data as
  // the parent, kid UI. This is the ONLY code a locked kiosk (`?kid=1`, the
  // kid one-way door) ever runs, so its data hook (`useBoardModel` above) sits
  // ABOVE this early return — hook-order law.
  if (audience === 'toddler') {
    const tod = timeOfDay(nowMs)
    const greet = me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]
    return <ToddlerBoard data={data} model={model} greet={greet} weather={weather} openTodos={openTodos} />
  }

  // Parent board, Pip "Today" layout: a handwritten tag + greeting, an "Up next"
  // now-card (tonight's supper), then a gentle grouped timeline of colour-coded
  // activity cards. Same data + writes as before — just the calm Pip surface.
  const tod = timeOfDay(nowMs)
  // LOCAL midnight of "today" — the calendar's day key, matching the server's
  // local-day bucketing (lib/monthgrid + /api/month). UTC midnight flipped a day
  // ahead every evening (~8 PM Eastern), so "today" highlighted tomorrow's cell.
  const todayDay = todayLocalDay()
  const tomorrowDay = addLocalDays(todayDay, 1)
  const eventWhen = (e: EventRow) =>
    // D-21: the flagged-chore evening announce reads « Ce soir », never « Fête »
    // (a distinct EventRow shape from `holiday` on purpose — see boardModel.ts).
    e.announce
      ? t.board.binTonight
      : e.holiday
      ? e.ferie
        ? t.board.holidayOff
        : t.board.holidayTag
      : e.birthday ? (e.age != null ? t.cercle.turnsN(e.age) : t.board.birthday) : e.all_day ? t.board.allDay : formatTime(e.start_at, lang)
  // À venir hint: append "· dans X jours" (demain / aujourd'hui) when an upcoming
  // item is within 3 days, so a glance sees how close it is, not just the date.
  // Beyond 3 days the date alone is calm enough; past/today items get nothing here.
  const withRel = (when: string, at: number): string => {
    const d = daysUntilLocal(at)
    return d >= 0 && d < 3 ? `${when} · ${t.cercle.inDaysN(d)}` : when
  }
  const eventAct = (e: EventRow) =>
    e.holiday ? (
      // A fête (derived, lib/year) is an ANNOUNCEMENT, not a thing to manage —
      // a static row, no peek, its emoji as the picture.
      <Act key={e.id} cat="event" emoji={e.emoji} title={e.title} when={eventWhen(e)} />
    ) : e.announce ? (
      // D-21: the flagged-chore evening announce — same "announcement, not a
      // thing to manage" shape as a fête, tinted with the chore category instead.
      <Act key={e.id} cat="chore" title={e.title} when={eventWhen(e)} />
    ) : (
    <Act
      key={e.id}
      cat={e.birthday ? 'birthday' : 'event'}
      title={e.title}
      when={eventWhen(e)}
      who={memberName(e.member_id) ?? undefined}
      color={memberColor(e.member_id) ?? undefined}
      mine={!!profileId && e.member_id === profileId}
      soon={e.soon}
      // A TIMED rendez-vous crosses out once its time has passed (the same line-crossed
      // treatment meals get) — all-day events + birthdays have no time, so never strike.
      // For a future day (Demain / À venir) start_at is ahead of now, so this is false.
      past={isPastSec(e.all_day ? null : e.start_at, nowMs)}
      onOpen={() => detail.open(buildEvent(e, detailCtx, eventActions.optsFor(e)))}
    />
    )
  // A L'auto work/job window on « Le fil du jour » — a static info row (no peek; work
  // windows are derived, not editable here): the time span, who, and a 🚗 when this
  // window holds the shared car. Tinted by the block colour (member colour falls back).
  const workAct = (w: WorkRow) => (
    <Act
      key={`work-${w.id}`}
      cat="work"
      title={w.label || t.board.atWork}
      when={`${formatTime(w.at, lang)}–${formatTime(w.endAt, lang)}`}
      who={memberName(w.member_id) ?? undefined}
      color={w.color ?? memberColor(w.member_id) ?? undefined}
      mine={!!profileId && w.member_id === profileId}
      icon={w.holds_car ? 'car-bold' : 'clock-bold'}
    />
  )
  const cookLine = (m: MealRow) =>
    memberName(m.cook_member_id) ? `${memberName(m.cook_member_id)} ${t.board.cooks}` : undefined

  // ── Detail-sheet contextual actions for meals + leftovers ──────────────────
  // Save a meal as a pool leftover (compensating undo: delete the created entry).
  const saveAsLeftover = async (id: string, title: string) => {
    const res = await write<{ id?: string }>('meal-leftovers', {
      method: 'POST',
      body: { title, sourceMealId: id },
      affectedKeys: [BOARD_KEY],
    }).catch(() => null)
    const leftoverId = res && !res.queued ? res.data?.id : undefined
    recordUndo({
      message: t.undo.leftoverAdded(title),
      onUndo: async () => {
        if (leftoverId)
          await write('meal-leftovers', { method: 'DELETE', body: { id: leftoverId }, affectedKeys: [BOARD_KEY] }).catch(() => {})
      },
    })
  }
  // Remove a planned meal (compensating undo: re-add it at same day+slot).
  const removeMealFromPlan = async (id: string, title: string, slot: string, date: number) => {
    await write('meals', { method: 'DELETE', body: { id }, affectedKeys: [BOARD_KEY] }).catch(() => {})
    recordUndo({
      message: t.undo.mealRemoved(title),
      onUndo: () =>
        write('meals', { method: 'POST', body: { date, slot, title }, affectedKeys: [BOARD_KEY] }).catch(() => {}),
    })
  }
  // Plan a pool leftover as tonight's supper (compensating undo: delete the
  // created meal + re-insert the pool row, exactly like Leftovers.tsx planLeftover).
  const planLeftoverTonight = async (id: string, title: string) => {
    const keys = [BOARD_KEY]
    const res = await write<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id, date: todayDay, slot: heroSlot },
      affectedKeys: keys,
    }).catch(() => null)
    const mealId = res && !res.queued ? res.data?.mealId : undefined
    recordUndo({
      message: t.undo.leftoverPlanned(title),
      onUndo: async () => {
        if (mealId) await write('meals', { method: 'DELETE', body: { id: mealId }, affectedKeys: keys }).catch(() => {})
        await write('meal-leftovers', { method: 'POST', body: { title }, affectedKeys: keys }).catch(() => {})
      },
    })
  }

  // A due recurring chore, surfaced on the board. Tapping marks it done (advances
  // the rotation server-side). DEFERRED: hide it now (pendingDone) and hold the
  // PATCH behind the undo toast, so a mis-tap costs nothing — and because the write
  // is merely held, an undo means the rotation never advanced (no server "un-do"
  // for completion exists, so deferring is the only correct way to take it back).
  const markChoreDone = (c: ChoreInstance) => {
    setPendingDone((s) => new Set(s).add(c.id))
    undo({
      message: t.undo.choreDone(c.title),
      onUndo: () =>
        setPendingDone((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        }),
      onCommit: async () => {
        await write('chores', { method: 'PATCH', body: { id: c.id, complete: true }, affectedKeys: [BOARD_KEY] }).catch(
          () => {},
        )
        // Wait for the board to reflect the change before un-hiding, else the stale
        // cached frame (still holding the row) flashes it back for a frame.
        await qc.refetchQueries({ queryKey: BOARD_KEY }).catch(() => {})
        setPendingDone((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        })
      },
    })
  }
  // "Fini" a leftover from the board (we ate it). DEFERRED behind the undo toast,
  // mirroring markChoreDone: hide it now (pendingLeftover), hold the DELETE, and a
  // tap of Annuler leaves it in the pool.
  const markLeftoverDone = (l: { id: string; title: string }) => {
    setPendingLeftover((s) => new Set(s).add(l.id))
    undo({
      message: t.undo.leftoverRemoved(l.title),
      onUndo: () =>
        setPendingLeftover((s) => {
          const n = new Set(s)
          n.delete(l.id)
          return n
        }),
      onCommit: async () => {
        await write('meal-leftovers', { method: 'DELETE', body: { id: l.id }, affectedKeys: [BOARD_KEY] }).catch(() => {})
        // Wait for the refetch so the stale frame can't flash the row back.
        await qc.refetchQueries({ queryKey: BOARD_KEY }).catch(() => {})
        setPendingLeftover((s) => {
          const n = new Set(s)
          n.delete(l.id)
          return n
        })
      },
    })
  }
  const choreAct = (c: ChoreInstance, withDay?: boolean) => (
    <Act
      key={c.id}
      cat="chore"
      title={c.title}
      when={withDay ? withRel(formatDayMaybeYear(c.at, lang), c.at) : undefined}
      who={c.who ?? undefined}
      color={c.color ?? undefined}
      mine={!!profileId && c.who_id === profileId}
      soon={c.soon}
      onCheck={withDay || ro ? undefined : () => markChoreDone(c)}
      onOpen={() => detail.open(buildChore(c, detailCtx, { upcoming: withDay, onDone: withDay || ro ? undefined : () => markChoreDone(c) }))}
    />
  )

  // A one-off to-do (non-recurring task). Checking it marks it done server-side
  // (same /chores PATCH — sets last_done_at), so it drops off the next board read.
  // DEFERRED behind the undo toast, mirroring markChoreDone: hide it now, hold the
  // write, and a tap of Annuler leaves it un-done.
  const markTodoDone = (c: ChoreInstance) => {
    setPendingDone((s) => new Set(s).add(c.id))
    undo({
      message: t.undo.todoDone(c.title),
      onUndo: () =>
        setPendingDone((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        }),
      onCommit: async () => {
        await write('chores', { method: 'PATCH', body: { id: c.id, complete: true }, affectedKeys: [BOARD_KEY] }).catch(
          () => {},
        )
        // Wait for the refetch so the stale frame can't flash the row back.
        await qc.refetchQueries({ queryKey: BOARD_KEY }).catch(() => {})
        setPendingDone((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        })
      },
    })
  }
  const todoAct = (c: ChoreInstance) => (
    <Act
      key={c.id}
      cat="chore"
      title={c.title}
      who={c.who ?? undefined}
      color={c.color ?? undefined}
      mine={!!profileId && c.who_id === profileId}
      soon={c.soon}
      onCheck={ro ? undefined : () => markTodoDone(c)}
      onOpen={() => detail.open(buildChore(c, detailCtx, { todo: true, onDone: ro ? undefined : () => markTodoDone(c) }))}
    />
  )

  // "Projets & Entretien" occurrence — checking it stamps last_done_at server-side
  // (home-projects PATCH with id alone), so a recurring upkeep's next occurrence
  // shows and a one-off drops off. DEFERRED behind the undo toast, like markChoreDone.
  const markHomeDone = (c: ChoreInstance) => {
    setPendingDone((s) => new Set(s).add(c.id))
    undo({
      message: t.undo.choreDone(c.title),
      onUndo: () =>
        setPendingDone((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        }),
      onCommit: async () => {
        await write('home-projects', { method: 'PATCH', body: { id: c.id }, affectedKeys: [BOARD_KEY] }).catch(() => {})
        await qc.refetchQueries({ queryKey: BOARD_KEY }).catch(() => {})
        setPendingDone((s) => {
          const n = new Set(s)
          n.delete(c.id)
          return n
        })
      },
    })
  }
  const homeAct = (c: ChoreInstance, withDay?: boolean) => {
    // A carnet-scoped row wears its thing's emoji so « Le chauffe-eau · filtre » reads
    // at a glance — but it stays an ordinary checkable Entretien row in place.
    const carnet = c.carnet_id ? carnetById.get(c.carnet_id) : undefined
    return (
    <Act
      key={c.id}
      cat="chore"
      title={carnet ? `${carnetEmoji(carnet)} ${c.title}` : c.title}
      when={withDay ? withRel(formatDayMaybeYear(c.at, lang), c.at) : undefined}
      color={c.color ?? undefined}
      soon={c.soon}
      onCheck={withDay || ro ? undefined : () => markHomeDone(c)}
      onOpen={() => detail.open(buildChore(c, detailCtx, { upcoming: withDay, onDone: withDay || ro ? undefined : () => markHomeDone(c) }))}
    />
    )
  }

  // The status band: « À régler » + the « Moments » entry, both as calm cards that
  // match the supper/weather heroes (same card look + height). It rides DIRECTLY
  // UNDER the heroes in Grille only — so the day's two glance cards sit on top, the
  // two heads-up cards just beneath. (Mois stays a clean calendar.)
  // Both band cards are per-device show/hide-able (« Disposition du babillard »), on top
  // of their own render conditions. When both are hidden the `.board-status:empty` rule
  // collapses the band.
  // The all-clear hero breathes a little instead of always showing the same sun:
  // the icon follows today's sky (clear→sun, evening-clear→moon, rain/snow/cloud…
  // via the shared weatherIcon helper) and the reassurance line drifts by daypart
  // or notable weather. Tint stays sage-deep so the hero keeps its calm identity —
  // we vary the *meaning*, not the colour. Reuses weatherIcon (lib/weather); no map.
  const clearIcon = weather
    ? weatherIcon({ bucket: weather.bucket, isDay: tod !== 'evening', tempC: weather.tempC })
    : tod === 'evening'
      ? 'moon-stars-bold'
      : 'sun-bold'
  const clearMoods = t.board.allClearMoods
  const clearSub =
    weather?.bucket === 'storm'
      ? clearMoods.storm
      : weather?.bucket === 'snow'
        ? clearMoods.snow
        : weather?.bucket === 'rain' || weather?.bucket === 'drizzle'
          ? clearMoods.rain
          : weather?.bucket === 'fog'
            ? clearMoods.fog
            : weather?.bucket === 'cloud'
              ? clearMoods.cloud
              : clearMoods[tod] // 'clear' or no weather → drift by daypart
  // A calm "all-clear" hero on a genuinely empty day — so a light day reads as
  // intentional, not broken. NOT a card: it has no id, no show/hide, no placement —
  // it's a property of the day. It used to share `.board-status` with Mots / À régler /
  // Moments; those three are now ordinary cards in the band zone, so this keeps the
  // strip to itself. NFR-CALM: a reassurance, never a prompt to fill the day.
  // A wall kiosk gets roomier columns — its cards are read from across the room. This
  // replaces the old `.hub[data-surface='kiosk'] .board-grid { columns: 340px }` override:
  // the column count is computed in JS now, so the minimum has to travel there too.
  const colMin = surface === 'kiosk' ? 340 : 300

  // How many cards this device has removed — the edit bar points at where they live,
  // since ✕ is otherwise a one-way door.
  const hiddenCount = BOARD_CARDS.filter((c) => cardMode(boardCards, c.id) === 'never').length

  const clearHero = dayClear ? (
    <div className="board-status">
      <div className="now-card now-card--clear">
        <span className="blob" aria-hidden="true" />
        <div className="label">{t.board.today}</div>
        <div className="what">{t.board.allClearTitle}</div>
        <div className="who">{clearSub}</div>
        <span className="icn" aria-hidden="true">
          <Icon name={clearIcon} size={38} color="var(--sage-deep)" />
        </span>
      </div>
    </div>
  ) : null

  // ── ONE card registry for BOTH zones ──────────────────────────────────────────
  // Built ONCE, before either WidgetGrid, so a card dragged across zones (« Moments »
  // down into the masonry, « Photo du jour » up into the band) still finds its node.
  // The two zones used to build SEPARATE maps inside their own children, and a
  // cross-zone card looked itself up in the wrong one: `nodes[id]` came back
  // undefined, `slotEmpty` read that as "empty", and the card vanished (or lingered
  // as a bare « Rien pour l'instant » shell). Zone membership lives in the prefs
  // arrays ALONE — every card must be renderable from either zone.
  const nodes: Partial<Record<BoardCardId, ReactNode>> = {}
  if (data) {
  nodes.notes = <Notes notes={data.notes ?? []} members={data.members} variant="notes" />
  // Tapping the supper opens its recipe outright; a recipe-less one peeks
  // with the leftover/remove plan actions.
  nodes.heroes = (
    <DayHeroes
      suppers={tonightMeals}
      supperColor={supperColor!}
      onOpenMeal={(m) =>
        openMeal(m, {
          color: supperColor,
          slotLabel: heroCardLabel(heroSlot, t),
          daySec: todayDay,
          onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
          onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot ?? heroSlot, todayDay),
        })
      }
      cookLine={cookLine}
      weather={weather}
      hours={wxHours}
      wonder={dayClear && audience === 'parent' ? null : wonder}
      onShuffleWonder={shuffleWonder}
      supperNow={focus === 'supper'}
      heroSlot={heroSlot}
    />
  )
  // « Laisse un mot » — the recipient's waiting mots (self-hides when there's
  // nothing for the picked face). Guests never see another face's mots.
  nodes.mots = ro ? null : <MotsCard help={help} />
  nodes.aRegler = <ARegler enabled={audience === 'parent' && !ro} variant="card" />
  nodes.moments = <MomentPeek />
  // « L'auto » glance — the car's status today + today's rides. #28
  nodes.autoCard = <AutoCard />
  // « Le fil du jour » — the day's shape: timed events + L'auto rides + work
  // windows on the axis; chores + all-day events pooled. Shown with ≥2 things
  // to place; when on, the « Aujourd'hui » card below drops these same events +
  // chores so nothing renders twice.
  nodes.fil = filShown ? (
    // Tint groups by meaning, not per-card novelty (NFR-CALM, fewer competing
    // hues on the wall): « Le fil du jour » IS today's timeline, so it shares
    // the warm marigold "today" family with « Aujourd'hui » below rather than
    // asserting its own sky accent. Warm = today, cool sky = later (Demain / À
    // venir), earthy = the task lists.
    <Section
      label={t.board.fil}
      icon="clock-bold"
      tint="var(--marigold)"
      help={help}
      helpKey="fil"
      now={filNow}
      // Compact: the day's things by name, in the order the ribbon places them — timed
      // rows lead with their hour so the tile says WHEN, not just what.
      compactItems={[
        ...filTimed.map((e) => ({ lead: e.all_day ? undefined : formatTime(e.start_at, lang), label: e.title })),
        ...filWork.map((w) => ({ lead: formatTime(w.at, lang), label: w.label || t.board.atWork })),
        ...todayChores.map((c) => ({ label: c.title })),
        ...filUntimed.map((e) => ({ label: e.title })),
      ]}
      compactHint={String(filTimed.length + filWork.length + todayChores.length + filUntimed.length)}
    >
      <Fil
        timed={[
          ...filTimed.map((e) => ({ id: e.id, start_at: e.start_at, node: eventAct(e) })),
          ...filWork.map((w) => ({ id: `work-${w.id}`, start_at: w.at, until: w.endAt, node: workAct(w) })),
        ]}
        untimed={[
          ...todayChores.map((c) => ({ id: c.id, node: choreAct(c) })),
          ...filUntimed.map((e) => ({ id: e.id, node: eventAct(e) })),
        ]}
        anytimeLabel={t.board.anytime}
        nowLabel={t.board.now}
        freeLabel={t.board.free}
        lang={lang}
      />
    </Section>
  ) : null
  // « Aujourd'hui » (+ « Demain » bunched) — the day's agenda.
  // One meal row (déjeuner/dîner/collation — souper is the « Ce soir » hero above),
  // extracted so a past-slot meal can fold into « Déjà passé » with the same anatomy.
  const mealAct = (m: (typeof otherMeals)[number]) => (
    <Act
      key={m.id}
      cat="meal"
      icon={SLOT_ICON_NAME[m.slot as MealSlot]}
      when={slotLabel(m.slot)}
      title={m.title}
      who={cookLine(m)}
      color={mealPrefs.color(m.slot)}
      mine={!!profileId && m.cook_member_id === profileId}
      past={m.past}
      onOpen={() =>
        openMeal(m, {
          color: mealPrefs.color(m.slot),
          slotLabel: slotLabel(m.slot),
          daySec: todayDay,
          onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
          onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot, todayDay),
        })
      }
    />
  )
  // Today's line-crossed items fold into a calm « Déjà passé aujourd'hui »
  // Disclosure so the card stays on now + next (the lifecycle keeps them as a quiet
  // record until midnight — see lib/itemLife). Only TIMED things fold: past-slot
  // meals + timed events whose moment has gone. Chores/todos/home + all-day events
  // are untimed → they never strike, so they always stay in the live list.
  const shownEvents = !filShown ? todayEvents.filter((e) => e.id !== nextUpToday?.id) : []
  const evtPast = (e: EventRow) => isPastSec(e.all_day ? null : e.start_at, nowMs)
  const liveMeals = otherMeals.filter((m) => !m.past)
  const pastMeals = otherMeals.filter((m) => m.past)
  const liveEvents = shownEvents.filter((e) => !evtPast(e))
  const pastEls = [...pastMeals.map(mealAct), ...shownEvents.filter(evtPast).map(eventAct)]
  // What the compact lens shows — everything the card is about to list, by name, already
  // at hand from the arrays just above. Few enough and the tile names them; too many and
  // it shows the count instead (`CardMini`). Past items are deliberately absent: they're
  // folded into « Déjà passé » below, and a tile has no room to say "and these are done".
  const todayItems: CompactRow[] = [
    ...liveMeals.map((m) => ({ label: m.title })),
    // Timed events lead with their hour; meals/chores/home are untimed → a plain dot.
    ...liveEvents.map((e) => ({ lead: e.all_day ? undefined : formatTime(e.start_at, lang), label: e.title })),
    ...(filShown ? [] : todayChores.map((c) => ({ label: c.title }))),
    ...todayHome.map((c) => ({ label: c.title })),
  ]
  const todayCount = todayItems.length
  nodes.today = (
    <Section
      label={t.board.today}
      compactLabel={t.board.todayShort}
      icon="sun-bold"
      tint="var(--marigold)"
      help={help}
      helpKey="today"
      now={todayNow}
      compactItems={todayItems}
      compactHint={todayCount > 0 ? String(todayCount) : undefined}
      // The day's temperature, where the eye already is (a quiet frosted chip, never a
      // count). Degrees only — the weather GLYPH pushed the title to ellipsize in the tiny
      // header; the grown card shows the icon. The chip is small enough to keep the title.
      compactHead={weather ? `${weather.tempC}°` : undefined}
    >
{/* « Prochainement » — the next timed thing today as a calm tappable
    headline above the full day list (the glance the « Maintenant » view
    used to give). Renders nothing once today's timed events are behind us.
    Hidden when « Le fil du jour » is on screen — the ribbon shows the next-up in place. */}
{!filShown && nextUpToday && (
  <button
    type="button"
    className="board-nextup"
    onClick={() => detail.open(buildEvent(nextUpToday, detailCtx, eventActions.optsFor(nextUpToday)))}
    aria-label={`${t.boardView.nextUp} · ${formatTime(nextUpToday.start_at, lang)} · ${nextUpToday.title}`}
  >
    <span className="board-nextup__kicker mono">
      <InlineIcon name="clock-bold" size={12} /> {t.boardView.nextUp}
    </span>
    <span className="board-nextup__when mono">{formatTime(nextUpToday.start_at, lang)}</span>
    <span className="board-nextup__title">{nextUpToday.title}</span>
  </button>
)}
{/* Quick actions, reused from the retired « Maintenant » view: jump straight
    to cooking the next planned meal (hidden for a leftover — nothing to
    cook) and a one-tap door to « Avant de partir » (the pre-departure
    checklist + corvées + L'auto). Calm pills, not banners.
    NFR-CALM: the COOK pill rides `!dayClear` — an empty agenda has nothing to
    cook. « Avant de partir » (the key) stays put on every day, clear or not:
    leaving the house is a thing you do regardless of how full the agenda is, and
    Marc wants the key reliably one tap away from the day card. */}
<div className="board-actions">
  {!dayClear && cook.meal && !cook.meal.is_leftover && (
    <button
      type="button"
      className="btn btn--ghost mono board-action--cook"
      onClick={() => nav(cook.target ?? '/kitchen')}
    >
      <InlineIcon name="cooking-pot-bold" size={16} />
      <span>{cook.target ? t.board.cook : t.board.cookPlan} · <b>{cook.meal.title}</b></span>
    </button>
  )}
  <button
    type="button"
    className="btn btn--ghost mono board-action--depart"
    onClick={() => nav('/board/departure')}
  >
    <InlineIcon name="key-bold" size={16} /> {t.departure.title}
  </button>
</div>
{/* When « Le fil du jour » is on screen it carries today's events + chores, so
    the day list shows only meals + home work here (no double render). The calm
    "Rien de prévu" only stands in when the fil is OFF and nothing's planned. */}
{!dayClear && !filShown && todayEvents.length === 0 && todayChores.length === 0 && todayHome.length === 0 && otherMeals.length === 0 ? (
  <EmptyState tone="calm" guide={{ card: 'board' }}>{t.board.todayClear}</EmptyState>
) : (
  <>
    {/* Today's still-to-come meals (déjeuner/dîner/collation) — supper is the
        "Ce soir" hero above. A past-slot meal folds into « Déjà passé » below.
        Each carries its slot food icon so the slots read apart, like La cuisine. */}
    {liveMeals.map(mealAct)}
    {/* Events + chores move to « Le fil du jour » when it's shown (see filShown).
        The next-up event is the « Prochainement » headline above, so it's already
        dropped (evtPast/shownEvents). Timed events past their moment fold below. */}
    {liveEvents.map(eventAct)}
    {/* Recurring chores due today — tap to check off (advances the turn). Untimed,
        so they never fold — they leave by being done, not by a passing minute. */}
    {!filShown && todayChores.map((c) => choreAct(c))}
    {/* Projets & Entretien due today — tap to check off (stamps done). */}
    {todayHome.map((c) => homeAct(c))}
    {/* The day's line-crossed record, collapsed (reuses the « Déjà vus » pattern). */}
    {pastEls.length > 0 && <Disclosure label={t.board.pastToday}>{pastEls}</Disclosure>}
  </>
)}

    </Section>
  )
  // « Prochaine routine » — the routine that fits the moment, so routines
  // aren't siloed in their tab. Self-hides when no carded routine exists.
  nodes.routineNext = <RoutineNextCard />
  // « Mes habitudes » — a door to « Le point du jour ». Names the household
  // habits; a picked face's own ones stay a presence line (private-ish).
  // Self-hides when nothing is asking today.
  nodes.habitudes = <HabitudesCard />
  // « Demain » — split out of the « Aujourd'hui » card into its OWN bento (it
  // used to be bunched in as a sub-group, which made the today tile by far the
  // tallest, busiest thing on the wall). Its own card keeps each glance to one
  // job and gives the masonry a cleaner unit. Cool sky tint = "later" (shared
  // with « À venir »), set apart from the warm marigold "today" family above.
  // Self-hides entirely when tomorrow holds nothing (the hasTomorrow gate).
  nodes.tomorrow = hasTomorrow ? (
    <Section
      label={t.board.tomorrow}
      icon="sun-horizon-bold"
      tint="var(--sky)"
      // Compact: tomorrow's things by name — the supper first, since it's the headline
      // the household actually looks for.
      compactItems={[
        ...(showTomorrowSupper && data.tomorrowMeal ? [{ label: data.tomorrowMeal.title }] : []),
        ...otherTomorrowMeals.map((m) => ({ label: m.title })),
        ...tomorrowEvents.map((e) => ({ lead: e.all_day ? undefined : formatTime(e.start_at, lang), label: e.title })),
      ]}
      // A name when there's one obvious headline (tomorrow's supper, like
      // "Spaghetti"); otherwise a quiet count of what's coming.
      compactHint={
        showTomorrowSupper && data.tomorrowMeal
          ? data.tomorrowMeal.title
          : otherTomorrowMeals.length + tomorrowEvents.length > 0
            ? String(otherTomorrowMeals.length + tomorrowEvents.length)
            : undefined
      }
      // Tomorrow's forecast in the mini header: just the daytime HIGH, no glyph — the full
      // high/low "18°/11°" plus a weather icon pushed « Demain » to ellipsize to « De… » in
      // a 142px tile. The high is the headline; the grown card shows both + the icon.
      compactHead={tomorrowWx ? `${tomorrowWx.highC}°` : undefined}
    >
      {/* D-17: the school/congé qualifier — silent almost every day BY
          DESIGN (rentrée/dernier jour/relâche edges/in-term fériés only,
          see lib/year.schoolDayKind), so it never becomes wallpaper. */}
      {model.tomorrowSchoolKind && (
        <p className="tomorrow-school mono">
          {model.tomorrowSchoolKind === 'school'
            ? `🎒 ${t.board.tomorrowSchool}`
            : `🏖️ ${t.board.tomorrowConge}`}
        </p>
      )}
      {tomorrowWx && (
        <div className="tomorrow-wx mono" aria-label={`${t.weather[tomorrowWx.bucket]} ${tomorrowWx.highC}° / ${tomorrowWx.lowC}°`}>
          <span aria-hidden="true" style={{ display: 'inline-flex' }}>
            <Icon
              name={weatherIcon({ bucket: tomorrowWx.bucket, isDay: true, tempC: tomorrowWx.highC })}
              size={17}
              color={weatherTint({ bucket: tomorrowWx.bucket, isDay: true, tempC: tomorrowWx.highC })}
            />
          </span>{' '}
          {tomorrowWx.highC}° / {tomorrowWx.lowC}°
        </div>
      )}
      {/* Tomorrow's prep note, surfaced TODAY — "sortir le poulet", "faire
          tremper les haricots" — while there's still time to act on it. */}
      {data.tomorrowNote && (
        <DayNote note={data.tomorrowNote} members={data.members} label={t.board.prepTomorrow} />
      )}
      {showTomorrowSupper && data.tomorrowMeal && (
        <Act
          cat="meal"
          icon={SLOT_ICON_NAME[heroSlot]}
          when={slotLabel(heroSlot)}
          title={data.tomorrowMeal.title}
          who={cookLine(data.tomorrowMeal)}
          color={supperColor}
          onOpen={() =>
            openMeal(data.tomorrowMeal!, {
              color: supperColor,
              slotLabel: slotLabel(heroSlot),
              daySec: tomorrowDay,
              onLeftover: ro ? undefined : () => saveAsLeftover(data.tomorrowMeal!.id, data.tomorrowMeal!.title),
              onRemove: ro ? undefined : () => removeMealFromPlan(data.tomorrowMeal!.id, data.tomorrowMeal!.title, heroSlot, tomorrowDay),
            })
          }
        />
      )}
      {otherTomorrowMeals.map((m) => (
        <Act
          key={m.id}
          cat="meal"
          icon={SLOT_ICON_NAME[m.slot as MealSlot]}
          when={slotLabel(m.slot)}
          title={m.title}
          who={cookLine(m)}
          color={mealPrefs.color(m.slot)}
          onOpen={() =>
            openMeal(m, {
              color: mealPrefs.color(m.slot),
              slotLabel: slotLabel(m.slot),
              daySec: tomorrowDay,
              onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
              onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot, tomorrowDay),
            })
          }
        />
      ))}
      {tomorrowEvents.map(eventAct)}
      {/* À compléter pinned to tomorrow — its named sections collapse so a long
          checklist stays a compact glance here; check/add stay functional. */}
      <TodoSection day={tomorrowTodoDay} title={t.todos.title} members={data.members} bento={false} hideWhenEmpty />
    </Section>
  ) : null
  // « À finir » — leftovers + à-faire bunched (null when both empty).
  // The two sub-headers ("Restants à finir" / "À faire") only earn their
  // keep when BOTH groups show — they're dividers. With one group the
  // section label "À finir" already heads it, so a lone subhead just
  // stacks a second near-synonymous title (Marc's redundant-title note).
  // « À finir » — leftovers to eat first (loose one-off tasks moved into the
  // unified « À faire » card below). Hidden when there are no leftovers.
  nodes.toFinish = leftovers.length > 0 ? (
    <Section
      label={t.board.toFinish}
      icon="arrow-counter-clockwise-bold"
      tint="var(--sage)"
      help={help}
      helpKey="toFinish"
      // Compact: which restants are waiting — the only thing worth knowing here.
      compactItems={leftovers.map((l) => l.title)}
      compactHint={String(leftovers.length)}
    >
      {leftovers.map((l) => (
        <Act
          key={l.id}
          cat="meal"
          icon="arrow-counter-clockwise-bold"
          when={t.kitchen.leftoversTag}
          title={l.title}
          onCheck={ro ? undefined : () => markLeftoverDone(l)}
          onOpen={() => detail.open(buildLeftover(l, detailCtx, {
            onDone: ro ? undefined : () => markLeftoverDone(l),
            onPlanTonight: ro ? undefined : () => planLeftoverTonight(l.id, l.title),
          }))}
        />
      ))}
    </Section>
  ) : null
  // « À faire » — the ONE to-do surface (UI merge of the two old todo cards;
  // backends unchanged). Loose one-off tasks (data.todos, often dictated) sit
  // under the « À faire » header; the reusable checklists (« À compléter »,
  // todos table + departure templates) ride below via the embedded TodoSection's
  // own header — two clearly-labelled groups in one card. The help "?" on the
  // title explains the distinction.
  // NFR-CALM: suppressed on a genuinely clear day (dayClear already requires
  // todayTodos + openTodos empty), so the reassuring all-clear hero isn't
  // contradicted by an empty card that can only ever offer an add affordance —
  // a card that can't "stay empty". The ＋ FAB remains the add path on such days.
  nodes.todos = dayClear ? null : (
    <Section
      label={t.board.todos}
      icon="check-bold"
      tint="var(--terracotta)"
      help={help}
      helpKey="todos"
      // Compact: everything the card actually holds, by name — the loose one-off tasks
      // AND the open « À compléter » checklist items (they were omitted before, so a card
      // whose only to-dos were checklist items read as an empty « À faire »). Both are
      // "things to do"; in a 142px glance, naming them beats a header that says which
      // sub-list each belongs to (that distinction is still there once the card grows).
      compactItems={[...todayTodos.map((c) => c.title), ...openTodos.map((td) => td.title)]}
      compactHint={
        todayTodos.length + openTodos.length > 0 ? String(todayTodos.length + openTodos.length) : undefined
      }
    >
      {todayTodos.map(todoAct)}
      <TodoSection title={t.todos.title} members={data.members} bento={false} />
    </Section>
  )
  // « À venir » — upcoming events/chores (null when none).
  nodes.upcoming = (upcomingEvents.length > 0 || upcomingChores.length > 0 || upcomingHome.length > 0) ? (
    <Section
      label={t.board.upcoming}
      icon="calendar-blank-bold"
      tint="var(--sky)"
      help={help}
      helpKey="upcoming"
      // Compact: what's coming — each row led by its short weekday (« sam · Fête »), since
      // these are days out and the day is the thing you're scanning for.
      compactItems={[
        ...upcomingEvents.map((e) => ({ lead: weekdayShort(e.start_at, lang), label: e.title })),
        ...upcomingChores.map((c) => ({ lead: weekdayShort(c.at, lang), label: c.title })),
        ...upcomingHome.map((c) => ({ lead: weekdayShort(c.at, lang), label: c.title })),
      ]}
      compactHint={String(upcomingEvents.length + upcomingChores.length + upcomingHome.length)}
    >
  {upcomingEvents.map((e) =>
    e.holiday ? (
      // A coming fête — static announce line with its date (no peek).
      <Act
        key={e.id}
        cat="event"
        emoji={e.emoji}
        title={e.title}
        when={withRel(formatDayMaybeYear(e.start_at, lang), e.start_at)}
      />
    ) : (
    <Act
      key={e.id}
      cat={e.birthday ? 'birthday' : 'event'}
      title={e.title}
      // Upcoming rows show the DATE too (not just the time): an event
      // days out otherwise read as a bare "12 h 00" with no day. Match
      // the chore rows below — date · time, then withRel's "· dans X j".
      when={withRel(`${formatDayMaybeYear(e.start_at, lang)} · ${eventWhen(e)}`, e.start_at)}
      soon={e.soon}
      onOpen={() => detail.open(buildEvent(e, detailCtx, eventActions.optsFor(e)))}
    />
    ),
  )}
  {/* Recurring chores coming up later this week, with their day. */}
  {upcomingChores.map((c) => choreAct(c, true))}
  {/* Projets & Entretien coming up this week, with their day. */}
  {upcomingHome.map((c) => homeAct(c, true))}
    </Section>
  ) : null
  // « Prochain voyage » — the next upcoming trip; hides itself when none.
  // « Le décompte » (A-5, bmad/09) — one suggestion-driven countdown; self-hides.
  nodes.countdown = <CountdownCard upcoming={upcomingEvents} />
  // « Notes (cercle) » — the durable Le cercle notes, lensed by the picked
  // face (their notes + Maisonnée); self-hides when that face has none.
  nodes.cercleNotes = <CercleNotesCard members={data.members} />
  nodes.voyage = <VoyageCard />
  // « Les carnets » — the long-jeu heads-up; hides itself when nothing's near.
  nodes.carnets = <CarnetsCard />
  // « Cette saison » — recurring upkeep due before the season turns; self-hides.
  nodes.seasonUpkeep = <SeasonUpkeepCard />
  // Family drawings strip (#14) — its own full-width band (CSS column-span).
  nodes.drawings = <Notes notes={data.notes ?? []} members={data.members} variant="drawings" action={galleryLink} />
  // « Photo du jour » band (the wonder photo also backs the weather hero).
  nodes.photos = <PhotoFrame />

  }
  return (
    <main className="board-wall">
      <BoardCanvas weatherBucket={weather?.bucket} />
      {/* No per-page add button: the shared yellow ＋ FAB (HubLayout) floats
          bottom-right here just like every other tab. */}
      {/* Time-of-day icon sits top-right as the section's identity (and, in
          tutorial mode, the Guide link); the view toggle + profile chip drop to
          their own row below so the avatar never reads as part of the filter. */}
      {/* The greeting is plain text so it can truncate cleanly when space is
          tight (mobile). The picked face is NOT echoed here — the profile chip
          (mobile) / member switcher (kiosk) on the row below already shows it,
          so repeating it crowded the header. Maisonnée (no face) → generic greet.
          Parent + non-guest: the greeting doubles as the « Depuis ce matin » (A-3)
          peek trigger — tap it for a cold, pull-only look at today's writes by
          face. A guest never gets this (read-only, no attribution to peek at). */}
      <HubHead
        title={
          !ro ? (
            <button type="button" className="greet__btn" onClick={() => setSinceMorningOpen(true)}>
              {me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]}
            </button>
          ) : me ? (
            `${t.today[tod]}, ${greetName(me.display_name)}`
          ) : (
            t.today[tod]
          )
        }
        icon={TOD_ICON[tod]}
        iconColor="var(--marigold-deep)"
        background="var(--marigold-wash)"
        card="board"
        action={help.available ? <HelpToggle active={help.active} onToggle={help.toggle} /> : undefined}
        searchPick={(run) => help.pick('search', run)}
      />

      {/* Board controls: today's date + who's at this phone + which of the four
          views, all on one row under the avatar (the date rides beside the view
          selector rather than on its own line under the greeting). */}
      <div className="board-controls">
        <BoardClock />
        <span className="board-controls__date mono">{formatDay(Math.floor(Date.now() / 1000), lang)}</span>
        {surface === 'mobile' && (
          <button
            type="button"
            className="profile-chip"
            onClick={() => setProfileOpen(true)}
            aria-label={t.profile.who}
            title={t.profile.who}
            data-tour="board-faces"
          >
            {me ? (
              (() => {
                // Show the real photo (small) when the member has one, like the
                // kiosk member switcher — falls back to the coloured initial.
                const photo = me.avatar_kind === 'photo' && me.avatar_ref ? imgUrl(me.avatar_ref) : null
                return (
                  <span className="profile-chip__av" style={{ background: photo ? undefined : me.colour }}>
                    {photo ? <img src={photo} alt="" /> : (me.display_name?.[0] ?? '?').toUpperCase()}
                  </span>
                )
              })()
            ) : (
              <span className="profile-chip__ask mono">{t.profile.askShort}</span>
            )}
          </button>
        )}
        <BoardViewToggle view={view} onChange={changeView} t={t} pick={help.pick} armed={help.active} />
        {/* The help "?" lives in the HubHead action slot (like La liste), NOT here:
            appended to this row it wrapped to a stranded second line on mobile. */}
      </div>
      {help.hint && <HelpHint />}
      {help.bubble}

      {/* No board SectionIntro: the board is the home screen — the first-run tour
          already walks through it, and stacking a "what is the board" card here on
          top of the demo-explore banner (or the setup checklist) was part of the
          onboarding pile-up. The other tabs keep their first-visit intro. */}

      {/* Shared kiosk: a one-tap face row to switch between Maisonnée (everyone)
          and an individual member — so anyone at the wall tablet can quickly act
          as themselves, then tap Maisonnée (or their face again) to step back. */}
      {surface === 'kiosk' && data && data.members.length > 0 && (
        // The tour anchor wraps here (block-level, layout-neutral): the same
        // `board-faces` key sits on the mobile profile chip above — exactly one
        // of the two renders per surface, so the spotlight finds the right one.
        <div data-tour="board-faces">
          <MemberSwitcher members={data.members} t={t} />
        </div>
      )}

      {/* No "Vue de <nom>" stamp: the profile chip / member switcher above
          already shows whose view this is (the selected face), so the label was
          redundant. Picking the face again (or Maisonnée) clears the filter. */}

      {/* A freshly-seeded household: a calm strip flags the demo data + offers
          keep/clear (operator only; auto-hides once cleared or dismissed). Sits
          above the welcome checklist so the "these are examples" context reads first. */}
      <SampleBanner />

      {/* A fresh household: the first-run setup checklist + the feature map, so a
          newcomer has a clear next step AND can see everything the app does. It
          auto-hides once the steps are done (or dismissed). */}
      {data && <WelcomeCard members={data.members} />}

      {/* Fridge notes (text / voice / photo) ride above the day in both parent views.
          DRAWINGS are split out to the Grille view only (below) — they deserve room and
          shouldn't crowd the compact Mois calendar.
          In GRILLE the notes card lives in the band zone with its peers (so it can be
          reordered, resized and dragged into the masonry). Mois / L'année have no band —
          only this one card — so it renders plainly here, exactly as it always did. */}
      {data && view !== 'bento' && isCardVisible(boardCards, 'notes') && (
        <Notes notes={data.notes ?? []} members={data.members} variant="notes" />
      )}

      {/* Today's day note (the per-day memo from La cuisine) rides here too, in
          every view — read-only on the wall, edited in the kitchen. Skipped in the
          Calendar (Mois) view: its day panel already shows today's note below, so
          this top copy would just repeat it. */}
      {view === 'bento' && data?.dayNote && <DayNote note={data.dayNote} members={data.members} />}

      {/* (Upcoming birthdays are NOT a separate strip here — they already ride in the
          « À venir » card below as dated rows, so a second « Anniversaires à venir »
          band would just duplicate them. « Le cercle » still has its own faces view.) */}

      {/* (« À régler » + « Moments » ride as the `statusBand` cards in GRILLE only —
          directly under the heroes. The calendar (Mois) stays a clean grid; you reach
          a specific day's recap by tapping it → « Voir ce moment ».) */}

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : view === 'month' ? (
        <MonthView members={data.members} lang={lang} t={t} todayDay={todayDay} initialOffset={monthJump} />
      ) : view === 'annee' ? (
        <YearView
          lang={lang}
          t={t}
          todayDay={todayDay}
          onOpenMonth={(i) => {
            // Drill into Mois at that month WITHOUT persisting the view — the
            // année stays this device's chosen glance across reloads.
            setMonthJump(i)
            setView('month')
          }}
        />
      ) : (
        <>
          {/* The edit-mode bar. ✕ removes a card from THIS device only, so the way back is
              Réglages ▸ Disposition — named here rather than left as a dead end. */}
          {editing && (
            <div className="board-edit" role="toolbar" aria-label={t.board.editTitle}>
              <div className="board-edit__text">
                <b>{t.board.editTitle}</b>
                <span className="mono">{t.board.editHint}</span>
              </div>
              <Cluster>
                {hiddenCount > 0 && (
                  <Link className="btn btn--ghost btn--sm" to="/settings?tab=board&sub=layout">
                    {t.board.editHiddenN(hiddenCount)} · {t.board.editRestore}
                  </Link>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={revertEdit}>
                  {t.board.editRevert}
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={exitEdit}>
                  {t.board.editDone}
                </button>
              </Cluster>
            </div>
          )}

          {/* THE BAND ZONE — the pinned glance strip. Fridge notes, the supper/weather
              heroes, and the heads-up cards (Mots / À régler / Moments) are now ordinary
              cards: each can be reordered, resized, hidden, or dragged down into the
              masonry. It caps at 3 columns, which is what the old `.board-status` flex
              row gave the three heads-up tiles. */}
          <WidgetGrid
            zone="band"
            maxCols={3}
            colMin={colMin}
            className="board-band"
            editing={editing}
            dnd={cardDnd}
            expandedId={expandedId}
            onExpand={expandCard}
            onCollapse={collapseCard}
            data-tour="board-cards"
          >
            {visibleCards(boardCards, 'band').map((id) => (
              <CardSlot key={id} id={id} zone="band" empty={slotEmpty(nodes[id])}>
                {nodes[id]}
              </CardSlot>
            ))}
          </WidgetGrid>

          {clearHero}

          {/* On a genuinely clear day the daily-wonder photo RELOCATES from the
              weather backdrop to this calm focal element — same band, a bigger
              frame, its source kicker intact (DayHeroes above is passed wonder=null
              in this exact case so the photo shows in ONE place, not two). Auto-hides
              when the feed/R2 is down or the device opted out (wonder === null).
              NFR-CALM: ambient, no data, no counts. Toddler keeps its own WonderFrame. */}
          {dayClear && audience === 'parent' && wonder && (
            <div className="board-focal-wonder">
              <WonderBand wonder={wonder} onShuffle={shuffleWonder} />
            </div>
          )}

          <WidgetGrid
            zone="grid"
            maxCols={4}
            colMin={colMin}
            className="board-grid"
            editing={editing}
            dnd={cardDnd}
            expandedId={expandedId}
            onExpand={expandCard}
            onCollapse={collapseCard}
          >
            {/* Data-driven card registry: each Grille card is keyed, then rendered in
                the per-device order with hidden ones dropped (lib/boardCards, set in
                Réglages ▸ Affichage or by long-pressing a card). The card JSX is
                unchanged — just addressable. */}
            {visibleCards(boardCards, 'grid').map((id) => (
              <CardSlot key={id} id={id} zone="grid" empty={slotEmpty(nodes[id])}>
                {nodes[id]}
              </CardSlot>
            ))}
          </WidgetGrid>
        </>
      )}

      {/* « L'auto » glance is placed per-view: the Grille view renders it at the TOP
          of its grid (above « Aujourd'hui »); the Mois (calendar) view renders it
          inside its day panel (so it follows the selected date). #28 */}

      {/* The label that trails the finger during a card drag (portalled to <body>). */}
      <DragGhost ghost={cardDnd.ghost} />

      {stale && <p className="board__synced mono">{t.board.offline}</p>}
      {surface === 'mobile' && <ProfilePicker open={profileOpen} onClose={() => setProfileOpen(false)} />}
      {!ro && <TodayChangesSheet open={sinceMorningOpen} onClose={() => setSinceMorningOpen(false)} />}
      {eventActions.node}
    </main>
  )
}
