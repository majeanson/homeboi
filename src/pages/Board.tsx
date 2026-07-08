import { useEffect, useRef, useState, Fragment, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { PairPrompt } from '../components/Fallback'
import { HubHead } from '../components/HubHead'
import { WelcomeCard } from '../components/WelcomeCard'
import { SampleBanner } from '../components/SampleBanner'
import { AutoCard } from '../components/board/AutoCard'
import { CarnetsCard } from '../components/board/CarnetsCard'
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
import { useSpeak } from '../lib/speak'
import { timeOfDay } from '../lib/timeofday'
import { isDaypartAuto } from '../lib/theme'
import { momentFocus } from '../lib/momentFocus'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { weatherIcon, weatherTint, weatherTip, type Weather, type DayOutlook, type HourOutlook } from '../lib/weather'
import { formatDay, formatDayMaybeYear, formatTime } from '../lib/format'
import { todayLocalDay, addLocalDays, daysUntilLocal } from '../lib/localDay'
import { useNow, isPastSec, mealSlotPast } from '../lib/itemLife'
import { pictoFor } from '../lib/picto'
import { imgUrl } from '../lib/image'
import { SLOT_ICON_NAME, SLOT_RANK, slotLabel as slotLabelFor, type MealSlot } from '../lib/mealSlots'
import { Act, Section } from '../components/board/Act'
import { Disclosure } from '../components/Disclosure'
import { Fil } from '../components/board/Fil'
import { DayTimeline } from '../components/jouer/DayTimeline'
import { PhotoFrame } from '../components/board/PhotoFrame'
import { BoardCanvas } from '../components/board/BoardCanvas'
import { WonderBand, WonderFrame, useWonder } from '../components/board/ApodFrame'
import { Notes } from '../components/board/Notes'
import { DayNote } from '../components/board/DayNote'
import { BoardViewToggle, MemberSwitcher } from '../components/board/chrome'
import { MonthView } from '../components/board/MonthView'
import { nameOf, colorOf, type ChoreInstance, type EventRow, type MealRow, type WorkRow } from '../components/board/types'
import { SimpleBoard } from '../components/board/SimpleBoard'
import { CountdownCard } from '../components/board/CountdownCard'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildEvent, buildChore, buildLeftover, buildMeal, type DetailCtx } from '../components/detail/adapters'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { useBoardData, useTagColors } from '../lib/queryHooks'
import { holidaysOnDay, holidaysInRange, useHolidaysEnabled, type Holiday } from '../lib/year'
import { useCarnets, carnetEmoji } from '../lib/carnets'
import { useBoardCards, visibleCardOrder, isCardVisible, type GridCardId } from '../lib/boardCards'

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
import { isGuest } from '../lib/device'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { BOARD_HELP } from '../lib/boardHelp'

// The meal-slot "past" thresholds + the shared past/now rule now live in lib/itemLife
// (SLOT_PAST_MIN / mealSlotPast / isPastSec / useNow), so every timed board item — meals,
// rendez-vous, work — crosses out by ONE rule on ONE clock.

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
  const speak = useSpeak()
  // The shared entity-detail peek (lib/detail) — tap a row to see picture/date/text
  // + smart actions. Parent audience only; the toddler lens stays hear-first below.
  const detail = useEntityDetail()
  // Resolves a tapped meal → its saved recipe so the peek shows the photo + glance.
  const recipeFor = useRecipeForMeal()
  const tagColors = useTagColors()
  // The board layout for this device (bento = Grille | month = Mois), remembered locally.
  const [view, setView] = useState<BoardView>(() => readBoardView())
  // Which Grille cards this device shows + their order (Réglages ▸ Affichage ▸
  // Disposition). Per-device, live via useSyncExternalStore (lib/boardCards).
  const boardCards = useBoardCards()
  // Contextual "?" help for the view toggle (lib/helpMode): arm it, tap a view to
  // learn what it shows instead of switching. Label = the view's own name.
  const help = useHelpMode(BOARD_HELP, (k) => {
    if (k.startsWith('view-')) return t.boardView[k.slice(5) as 'bento' | 'month']
    const titles: Record<string, string> = {
      todos: t.board.todos,
      today: t.board.today,
      fil: t.board.fil,
      toFinish: t.board.toFinish,
      upcoming: t.board.upcoming,
      search: t.search.title,
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
  function changeView(v: BoardView) {
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
  const tip = weatherTip(weather)
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
  // Chronological within a day: déjeuner → dîner → collation → souper. The server
  // returns todayMeals in position order (stable within a slot), so a stable sort
  // by SLOT_RANK gives time order across slots while keeping intra-slot position.
  const bySlotTime = (a: { slot: string }, b: { slot: string }) =>
    SLOT_RANK[a.slot as MealSlot] - SLOT_RANK[b.slot as MealSlot]
  // Per-slot meal colour + visibility (Réglages ▸ Repas). A meal's slot tints its
  // card here and everywhere it shows; a hidden slot drops off the glance.
  const mealPrefs = useMealPrefs()
  const supperColor = mealPrefs.color('supper')
  // « Préparer le repas » — the next meal due that resolves to a recipe → its cook
  // mode (or the picker when it's free-text). Reused from the retired « Maintenant »
  // view: a quick action beside « Prochainement », never a dead end (a planned
  // leftover has nothing to cook, so the CTA hides for it).
  const cook = useNextMeal()
  const nav = useNavigate()
  // Today's meals beside the supper hero. Supper is already the "Ce soir" hero, so
  // the day list shows the OTHER slots — together they cover the whole day's table.
  // Hidden slots are filtered out so "I only care about souper" empties the row.
  const otherMeals = (data?.todayMeals ?? []).filter((m) => m.slot !== 'supper' && mealPrefs.isVisible(m.slot)).sort(bySlotTime)
  // Tomorrow's meals shown in Demain. Supper has its own line there, so list the
  // rest — together they cover tomorrow's table for prep-ahead planning.
  const otherTomorrowMeals = (data?.tomorrowMeals ?? []).filter((m) => m.slot !== 'supper' && mealPrefs.isVisible(m.slot)).sort(bySlotTime)
  // Tonight's supper hero(es) — hidden entirely if souper is toggled off.
  const tonightMeals = mealPrefs.isVisible('supper') ? data?.tonightMeals ?? [] : []
  // Tomorrow's supper line, gated the same way.
  const showTomorrowSupper = !!data?.tomorrowMeal && mealPrefs.isVisible('supper')

  // "La galerie" door, shown in the Grille view. It rides as a small trailing
  // chip inside the drawings strip (beside the photos on tablet, under them on
  // mobile) so it never claims its own row; when there are no drawings yet it
  // still appears so saved gallery drawings stay reachable.
  const galleryLink = (
    <Link to="/drawings" className="chip"><InlineIcon name="paint-brush-bold" /> {t.memo.galleryLink}</Link>
  )

  // Personal focus: when a face is picked (mobile chip / kiosk switcher), the
  // board narrows to THAT person's things plus shared "Maisonnée" items (no
  // owner) — others' personal events/chores drop away. Meals are the family's
  // table (always Maisonnée), so they're never filtered. Maisonnée (no pick) =
  // everyone, the unfiltered board.
  const focusing = !!profileId
  const mineEvent = (e: EventRow) => !focusing || e.member_id === profileId || e.member_id === null
  // A chore is "mine" when it's my turn, unassigned (Maisonnée), OR I'm anywhere
  // in its rotation team — a shared chore stays visible + doable to every teammate
  // even on someone else's turn (the `who` line still says whose turn it is).
  const mineChore = (c: ChoreInstance) =>
    !focusing || c.who_id === profileId || c.who_id === null || (!!profileId && !!c.team?.includes(profileId))
  // A-2 (bmad/09): les fêtes QC/CA — DERIVED on-device (lib/year, the D-16
  // layer; no rows, no fetch) and merged into the same event arrays every lens
  // reads (parent, toddler, simple, fil). Calm zero-impact announce lines:
  // all-day, nobody's, never editable — the emoji is the picture. All shown by
  // default; per-device opt-out in Réglages ▸ Affichage (Marc's OQ-4 verdict).
  const fetesOn = useHolidaysEnabled()
  const holidayRow = (h: Holiday, at: number): EventRow => ({
    id: `fete-${h.id}-${at}`,
    title: h.label[lang],
    start_at: at,
    all_day: 1,
    member_id: null,
    holiday: true,
    ferie: h.kind === 'ferie',
    emoji: h.emoji,
  })
  const dayNow = todayLocalDay()
  const todayEvents = [
    ...(fetesOn ? holidaysOnDay(dayNow).map((h) => holidayRow(h, dayNow)) : []),
    ...(data?.today ?? []).filter(mineEvent),
  ]
  const todayChores = (data?.choresToday ?? []).filter(mineChore).filter((c) => !pendingDone.has(c.id))
  const todayTodos = (data?.todos ?? []).filter(mineChore).filter((c) => !pendingDone.has(c.id))
  const tomorrowEvents = [
    ...(fetesOn ? holidaysOnDay(addLocalDays(dayNow, 1)).map((h) => holidayRow(h, addLocalDays(dayNow, 1))) : []),
    ...(data?.tomorrow ?? []).filter(mineEvent),
  ]
  // « À venir »: the next stretch of fêtes (10 days past demain) rides sorted
  // among the real events — same window feel as the server's upcoming bucket.
  const upcomingEvents = [
    ...(fetesOn ? holidaysInRange(addLocalDays(dayNow, 2), 10).map((x) => holidayRow(x.holiday, x.at)) : []),
    ...(data?.upcoming ?? []).filter(mineEvent),
  ].sort((a, b) => a.start_at - b.start_at)
  const upcomingChores = (data?.choresUpcoming ?? []).filter(mineChore)
  // "Projets & Entretien" (home_projects) dated occurrences — family-wide (no
  // rotation), so not personal-focus filtered. Minus any just checked (held undo).
  const todayHome = (data?.homeToday ?? []).filter((c) => !pendingDone.has(c.id))
  const upcomingHome = data?.homeUpcoming ?? []
  // Undated leftovers to finish — a calm "eat these first" nudge. Family-wide (not
  // personal-focus filtered), minus any just marked Fini (held behind the undo).
  const leftovers = (data?.leftovers ?? []).filter((l) => !pendingLeftover.has(l.id))
  // « Prochainement » — the soonest still-to-come timed event today (after the face
  // lens), surfaced as a calm headline at the top of the Grille day. This is the one
  // genuinely useful thing the retired « Maintenant » view gave: a glanceable "next".
  // A 30-min grace keeps an event that's happening right now in the headline.
  const nowSecBoard = Math.floor(Date.now() / 1000)
  const nextUpToday = [...todayEvents]
    .filter((e) => !e.all_day && e.start_at >= nowSecBoard - 1800)
    .sort((a, b) => a.start_at - b.start_at)[0]
  // « Le fil du jour » — the day read as a SHAPE (a soft time axis + a « maintenant »
  // marker): timed events + L'auto rides + work/job windows on the axis; chores + all-day
  // events pool under « À tout moment ». A separate, optional card (lib/boardCards 'fil');
  // it answers *when*, so when it's on screen the « Aujourd'hui » card drops the same
  // events + chores (and the lone-next-up « Prochainement » headline) to avoid rendering
  // them twice. Shown with ≥2 things to place on the axis (timed events + work windows).
  const filTimed = todayEvents.filter((e) => !e.all_day)
  const filUntimed = todayEvents.filter((e) => !!e.all_day)
  // L'auto work/job windows landing today (data.work — derived schedule spans, real
  // start/end times); filtered by the same face lens as events.
  const mineWork = (w: WorkRow) => !focusing || w.member_id === profileId || w.member_id === null
  const filWork = (data?.work ?? []).filter(mineWork)
  const filShown = isCardVisible(boardCards, 'fil') && filTimed.length + filWork.length >= 2
  // A genuinely clear day for the PARENT board: nothing to attend or do today (events,
  // chores, home work, meals, leftovers, to-dos, work windows all empty). Weather/notes/
  // tomorrow don't count — this is "today's agenda is empty". Surfaces one calm "all-clear"
  // hero so a light day reads as intentional, not broken (the toddler lens already has its
  // own `kidAllClear`). NFR-CALM.
  const dayClear =
    !!data &&
    todayEvents.length === 0 &&
    todayChores.length === 0 &&
    todayHome.length === 0 &&
    otherMeals.length === 0 &&
    tonightMeals.length === 0 &&
    leftovers.length === 0 &&
    todayTodos.length === 0 &&
    openTodos.length === 0 &&
    filWork.length === 0
  // Time-aware emphasis (lib/momentFocus): the board gently leans toward what matters now —
  // the day ahead in the morning, the supper hero as dinner nears, « Demain » prep in the
  // evening. Folded under the ambient toggle (Réglages ▸ Affichage): ambient on → the board
  // also leans by time; off → no emphasis. A soft accent, never a reshuffle.
  const focus = isDaypartAuto() ? momentFocus(Date.now()) : null
  const filNow = focus === 'day' && filShown
  const todayNow = (focus === 'day' && !filShown) || focus === 'evening'
  // « Demain » is bunched into the Aujourd'hui card — show it ONLY when tomorrow holds
  // something (a forecast, a prep note, a meal, an event, or a pinned to-do), so an
  // empty tomorrow never renders a bare "Rien de prévu" sub-group.
  const hasTomorrow =
    !!tomorrowWx ||
    !!data?.tomorrowNote ||
    showTomorrowSupper ||
    otherTomorrowMeals.length > 0 ||
    tomorrowEvents.length > 0 ||
    tomorrowTodoCount > 0

  if (unauth) return <PairPrompt />

  // The picked member on this device (greeting + "your day" emphasis, both
  // lenses). Null on a shared kiosk with nobody picked.
  const me = data?.members.find((m) => m.id === profileId) ?? null

  // Toddler lens on the SAME board data as the parent — same content, kid UI:
  // big read-aloud tiles, picture-first, member colour says whose thing it is.
  // Heroes (meals + weather) sit on top; then Today / Demain / chores / list /
  // photos, mirroring the parent board so nothing is missing for a pre-reader.
  const eventTiles = (rows: EventRow[]): Tile[] =>
    rows.map((e) => ({
      key: e.id,
      // Draw the event's own picture (school/swim/birthday…) so a pre-reader can
      // tell things apart; a derived fête brings its own emoji (⚜️ 🎃 🎄);
      // fall back to a pin when nothing matches.
      icon: e.emoji ?? pictoFor(e.title, '📌'),
      label: e.title,
      sub: e.holiday ? (e.ferie ? t.board.holidayOff : t.board.holidayTag) : e.all_day ? t.board.allDay : formatTime(e.start_at, lang),
      narration: e.title,
      color: memberColor(e.member_id) ?? undefined,
    }))

  // « Simple » lens (bmad/08 A-1) — the post-reader/grandma board: four giant
  // calm zones (Aujourd'hui · Souper · La liste · Notes) off the SAME data. The
  // other tabs inherit the parent views; only the board gets this bespoke glance.
  if (audience === 'simple') {
    const tod = timeOfDay(nowMs)
    const greet = me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]
    return <SimpleBoard data={data} todayEvents={todayEvents} greet={greet} />
  }

  if (audience === 'toddler') {
    const tod = timeOfDay(nowMs)

    const mealHero = (meal: MealRow | null, key: 'tonight' | 'tomorrow') =>
      meal ? (
        <button
          type="button"
          className="today-hero today-hero--meal"
          onClick={() => speak(`${t.board[key]}: ${meal.title}`)}
          aria-label={`${t.board[key]}: ${meal.title}`}
        >
          <span className="today-hero__icon" aria-hidden="true">{pictoFor(meal.title, '🍽')}</span>
          <span className="today-hero__label">{meal.title}</span>
          {/* A picture hint beside the word, so "tonight vs tomorrow" doesn't
              hang on reading alone (NFR-KID-2 soft-reading). */}
          <span className="today-hero__sub mono">
            <InlineIcon
              name={key === 'tonight' ? 'moon-stars-bold' : 'sun-horizon-bold'}
              size={14}
              color={key === 'tonight' ? 'var(--berry-deep)' : 'var(--marigold-deep)'}
            />{' '}
            {t.board[key]}
          </span>
        </button>
      ) : null

    // Tapping the weather also SPEAKS the dressing tip ("mets un manteau") —
    // that's the actionable part for a pre-schooler getting ready. Audio only:
    // the picture + temperature stay the calm visual.
    const weatherHero = weather ? (
      <button
        type="button"
        className="today-hero today-hero--weather"
        onClick={() =>
          speak(`${t.weather[weather.bucket]}, ${weather.tempC}°.${tip ? ` ${t.weather.tip[tip]}` : ''}`)
        }
        aria-label={`${t.weather[weather.bucket]} ${weather.tempC}°`}
      >
        <span className="today-hero__icon" aria-hidden="true"><Icon name={weatherIcon(weather)} size={56} color={weatherTint(weather)} /></span>
        <span className="today-hero__label">{weather.tempC}°</span>
        <span className="today-hero__sub mono">{t.weather[weather.bucket]}</span>
      </button>
    ) : null

    const kidSection = (label: string, tiles: Tile[]) =>
      tiles.length > 0 ? (
        <section className="today-kid__section">
          <Sayable className="today-kid__h" text={label} />
          <BigTiles tiles={tiles} />
        </section>
      ) : null

    const greet = me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]
    // Nothing planned anywhere today/tomorrow → the kid sections all collapse and
    // the board reads as a blank gap. Show one calm, tap-to-hear "all clear" line
    // instead, so an empty day still feels intentional to a pre-reader.
    const kidAllClear =
      !!data &&
      !(mealPrefs.isVisible('supper') && (data.tonight || data.tomorrowMeal)) &&
      !weather &&
      (data.notes?.length ?? 0) === 0 &&
      !data.dayNote &&
      otherMeals.length === 0 &&
      leftovers.length === 0 &&
      todayEvents.length === 0 &&
      todayChores.length === 0 &&
      todayTodos.length === 0 &&
      openTodos.length === 0 &&
      !data.tomorrowNote &&
      tomorrowEvents.length === 0 &&
      (data.tomorrowMeals?.length ?? 0) === 0
    return (
      <main className="kid__main today-kid">
        <BoardCanvas weatherBucket={weather?.bucket} />
        {/* Greet the picked child by name — same personal touch the parent
            board gets. Generic when nobody's picked (shared wall). Tap to hear. */}
        <Sayable className="today-kid__greet" text={greet} />
        {!data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : (
          <>
            <div className="today-kid__heroes">
              {/* Supper heroes follow the same show/hide as the parent board. */}
              {mealPrefs.isVisible('supper') && mealHero(data.tonight, 'tonight')}
              {mealPrefs.isVisible('supper') && mealHero(data.tomorrowMeal, 'tomorrow')}
              {weatherHero}
            </div>
            <Notes notes={data.notes ?? []} members={data.members} toddler />
            {/* A big, friendly door into "Mes dessins" — the kid's own drawing
                collection (draw new ones with handwriting lines / tracing / colour-in
                / stickers, and see everything they've kept). */}
            <div className="today-kid__doors">
              <Link to="/drawings" className="today-kid__draw">
                <span className="today-kid__draw-icn" aria-hidden="true">🎨</span>
                <span>{t.memo.galleryTitle}</span>
              </Link>
              {/* A big, friendly door into « Jouer » — the toddler play space (find-it,
                  the day timeline, the birthday countdown). All hear-first, no score. */}
              <Link to="/jouer" className="today-kid__draw today-kid__play">
                <span className="today-kid__draw-icn" aria-hidden="true">🎲</span>
                <span>{t.play.door}</span>
              </Link>
            </div>
            {/* « Le fil du jour », toddler lens — the hear-first day SEQUENCE (matin →
                midi → soir → dodo) the play space uses, so a pre-reader gets the same
                "shape of the day" the parent ribbon gives. Honours the per-device 'fil'
                toggle (Réglages ▸ Affichage ▸ Disposition). */}
            {isCardVisible(boardCards, 'fil') && (
              <section className="today-kid__section">
                <Sayable className="today-kid__h" text={t.board.fil} />
                <DayTimeline />
              </section>
            )}
            {data.dayNote && <DayNote note={data.dayNote} members={data.members} toddler />}
            {/* Every meal planned for today, read-aloud — supper rides up in the
                heroes, so this lists the rest of the day's table. */}
            {kidSection(
              t.board.meals,
              otherMeals.map((m) => ({
                key: m.id,
                icon: pictoFor(m.title, '🍽'),
                label: m.title,
                sub: slotLabel(m.slot),
                narration: `${slotLabel(m.slot)}: ${m.title}`,
                color: memberColor(m.cook_member_id) ?? undefined,
              })),
            )}
            {/* Restants à finir — read-aloud reminder to eat leftovers first. A
                pre-reader just sees/hears them; finishing one is a parent action. */}
            {kidSection(
              t.kitchen.leftoversBoard,
              leftovers.map((l) => ({
                key: l.id,
                icon: pictoFor(l.title, '🍽'),
                label: l.title,
                sub: t.kitchen.leftoversTag,
                narration: l.title,
              })),
            )}
            {kidSection(t.board.today, eventTiles(todayEvents))}
            {/* Chores due today, as read-aloud tiles — whose turn rides in the sub. */}
            {kidSection(
              t.board.chores,
              todayChores.map((c) => ({
                key: c.id,
                icon: pictoFor(c.title, '🧹'),
                label: c.title,
                sub: c.who ?? undefined,
                narration: c.who ? `${c.title}. ${c.who}` : c.title,
                color: c.color ?? undefined,
              })),
            )}
            {/* « À faire » — read aloud too. Mirrors the parent board's ONE to-do card:
                the loose one-off tasks AND the checklists (« À compléter ») in a single
                section, so a pre-reader sees everything left to do in one place. */}
            {kidSection(t.board.todos, [
              ...todayTodos.map((c) => ({
                key: c.id,
                icon: pictoFor(c.title, '✅'),
                label: c.title,
                sub: c.who ?? undefined,
                narration: c.title,
                color: c.color ?? undefined,
              })),
              ...openTodos.map((td) => ({
                key: td.id,
                icon: pictoFor(td.title, '✅'),
                label: td.title,
                narration: td.title,
                color: memberColor(td.member_id) ?? undefined,
              })),
            ])}
            {data.tomorrowNote && (
              <DayNote note={data.tomorrowNote} members={data.members} label={t.board.prepTomorrow} toddler />
            )}
            {kidSection(t.board.tomorrow, [
              ...eventTiles(tomorrowEvents),
              ...(data.tomorrowMeals ?? []).map((m) => ({
                key: m.id,
                icon: pictoFor(m.title, '🍽'),
                label: m.title,
                sub: slotLabel(m.slot),
                narration: `${slotLabel(m.slot)}: ${m.title}`,
                color: memberColor(m.cook_member_id) ?? undefined,
              })),
            ])}
            {kidAllClear && (
              <Sayable className="today-kid__clear" text={`🌤️ ${t.board.kidAllClear}`} />
            )}
            <PhotoFrame />
            {/* « Photo du jour » — a big tap-to-hear tile in the toddler lens. */}
            <WonderFrame />
          </>
        )}
      </main>
    )
  }

  // Parent board, Pip "Today" layout: a handwritten tag + greeting, an "Up next"
  // now-card (tonight's supper), then a gentle grouped timeline of colour-coded
  // activity cards. Same data + writes as before — just the calm Pip surface.
  const tod = timeOfDay(nowMs)
  // LOCAL midnight of "today" — the calendar's day key, matching the server's
  // local-day bucketing (lib/monthgrid + /api/month). UTC midnight flipped a day
  // ahead every evening (~8 PM Eastern), so "today" highlighted tomorrow's cell.
  const todayDay = todayLocalDay()
  // What the adapters (components/detail/adapters) need to resolve faces + copy.
  // recipeFor lets a tapped meal show its recipe photo + ingredient glance.
  const detailCtx: DetailCtx = { t, lang, members: data?.members ?? [], recipeFor, tagColors }
  const tomorrowDay = addLocalDays(todayDay, 1)
  // Whether a meal slot's time has passed → the shared rule (lib/itemLife), so a meal
  // crosses out on the SAME clock as a rendez-vous (souper is the headline → never past).
  const isSlotPast = (slot: string) => mealSlotPast(slot, nowMs)
  const eventWhen = (e: EventRow) =>
    e.holiday
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
      body: { action: 'plan', id, date: todayDay, slot: 'supper' },
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
  const statusBand = (
    <div className="board-status">
      {/* A calm "all-clear" hero on a genuinely empty day — so a light day reads as
          intentional, not broken. Auto-hiding (no customization toggle), like the other
          empty-aware strips. NFR-CALM: a reassurance, never a prompt to fill the day. */}
      {dayClear && (
        <div className="now-card now-card--clear">
          <span className="blob" aria-hidden="true" />
          <div className="label">{t.board.today}</div>
          <div className="what">{t.board.allClearTitle}</div>
          <div className="who">{clearSub}</div>
          <span className="icn" aria-hidden="true">
            <Icon name={clearIcon} size={38} color="var(--sage-deep)" />
          </span>
        </div>
      )}
      {/* « Laisse un mot » — the recipient's waiting mots (a heads-up that self-hides when
          there's nothing for the picked face). Guests never see another face's mots. */}
      {!ro && isCardVisible(boardCards, 'mots') && <MotsCard />}
      {isCardVisible(boardCards, 'aRegler') && (
        <ARegler enabled={surface === 'mobile' && audience === 'parent' && !ro} variant="card" />
      )}
      {isCardVisible(boardCards, 'moments') && <MomentPeek />}
    </div>
  )

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
          so repeating it crowded the header. Maisonnée (no face) → generic greet. */}
      <HubHead
        title={me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]}
        icon={TOD_ICON[tod]}
        iconColor="var(--marigold-deep)"
        background="var(--marigold-wash)"
        card="board"
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
        {help.available && <HelpToggle active={help.active} onToggle={help.toggle} />}
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
        <MemberSwitcher members={data.members} t={t} />
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

      {/* Fridge notes (text / voice / photo) ride above the day in both parent
          views. DRAWINGS are split out to the Grille view only (below) — they
          deserve room and shouldn't crowd the compact Mois calendar. Per-device
          show/hide-able like the other band cards (« Disposition du babillard »). */}
      {data && isCardVisible(boardCards, 'notes') && (
        <Notes notes={data.notes ?? []} members={data.members} variant="notes" />
      )}

      {/* Today's day note (the per-day memo from La cuisine) rides here too, in
          every view — read-only on the wall, edited in the kitchen. Skipped in the
          Calendar (Mois) view: its day panel already shows today's note below, so
          this top copy would just repeat it. */}
      {view !== 'month' && data?.dayNote && <DayNote note={data.dayNote} members={data.members} />}

      {/* (Upcoming birthdays are NOT a separate strip here — they already ride in the
          « À venir » card below as dated rows, so a second « Anniversaires à venir »
          band would just duplicate them. « Le cercle » still has its own faces view.) */}

      {/* (« À régler » + « Moments » ride as the `statusBand` cards in GRILLE only —
          directly under the heroes. The calendar (Mois) stays a clean grid; you reach
          a specific day's recap by tapping it → « Voir ce moment ».) */}

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : view === 'month' ? (
        <MonthView members={data.members} lang={lang} t={t} todayDay={todayDay} />
      ) : (
        <>
          {/* The "today" zone heroes — tonight's supper + the weather/photo card — ride
              on top via DayHeroes (the polished glance cards). The meal tap keeps
              Grille's leftover/remove detail actions. The heads-up cards (À régler +
              Moments) sit DIRECTLY beneath them via statusBand, matching their look. */}
          {isCardVisible(boardCards, 'heroes') && (
            <DayHeroes
              suppers={tonightMeals}
              supperColor={supperColor!}
              onOpenMeal={(m) =>
                detail.open(buildMeal(m, detailCtx, {
                  color: supperColor,
                  slotLabel: t.board.tonight,
                  daySec: todayDay,
                  onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
                  onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot ?? 'supper', todayDay),
                }))
              }
              cookLine={cookLine}
              weather={weather}
              hours={wxHours}
              wonder={dayClear && audience === 'parent' ? null : wonder}
              onShuffleWonder={shuffleWonder}
              supperNow={focus === 'supper'}
            />
          )}

          {/* Heads-up cards (À régler + Moments) directly under the heroes. */}
          {statusBand}

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

          <div className="board-grid">
            {/* Data-driven card registry: each Grille card is keyed, then rendered in
                the per-device order with hidden ones dropped (lib/boardCards, set in
                Réglages ▸ Affichage). The card JSX is unchanged — just addressable. */}
            {(() => {
              const nodes: Partial<Record<GridCardId, ReactNode>> = {}
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
                <Section label={t.board.fil} icon="clock-bold" tint="var(--marigold)" help={help} helpKey="fil" now={filNow}>
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
                  past={isSlotPast(m.slot)}
                  onOpen={() =>
                    detail.open(buildMeal(m, detailCtx, {
                      color: mealPrefs.color(m.slot),
                      slotLabel: slotLabel(m.slot),
                      daySec: todayDay,
                      onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
                      onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot, todayDay),
                    }))
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
              const liveMeals = otherMeals.filter((m) => !isSlotPast(m.slot))
              const pastMeals = otherMeals.filter((m) => isSlotPast(m.slot))
              const liveEvents = shownEvents.filter((e) => !evtPast(e))
              const pastEls = [...pastMeals.map(mealAct), ...shownEvents.filter(evtPast).map(eventAct)]
              nodes.today = (
                <Section label={t.board.today} icon="sun-bold" tint="var(--marigold)" help={help} helpKey="today" now={todayNow}>
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
                NFR-CALM: the whole row is suppressed on a genuinely clear day — an empty
                agenda has nothing to cook and no reason to prompt "before you leave", so
                the glance card stays a thing to READ, not an operate surface. The depart
                pill was previously rendered unconditionally; it now rides the same gate. */}
            {!dayClear && (
            <div className="board-actions">
              {cook.meal && !cook.meal.is_leftover && (
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
            )}
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
              // « Demain » — split out of the « Aujourd'hui » card into its OWN bento (it
              // used to be bunched in as a sub-group, which made the today tile by far the
              // tallest, busiest thing on the wall). Its own card keeps each glance to one
              // job and gives the masonry a cleaner unit. Cool sky tint = "later" (shared
              // with « À venir »), set apart from the warm marigold "today" family above.
              // Self-hides entirely when tomorrow holds nothing (the hasTomorrow gate).
              nodes.tomorrow = hasTomorrow ? (
                <Section label={t.board.tomorrow} icon="sun-horizon-bold" tint="var(--sky)">
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
                      icon={SLOT_ICON_NAME.supper}
                      when={slotLabel('supper')}
                      title={data.tomorrowMeal.title}
                      who={cookLine(data.tomorrowMeal)}
                      color={supperColor}
                      onOpen={() =>
                        detail.open(buildMeal(data.tomorrowMeal!, detailCtx, {
                          color: supperColor,
                          slotLabel: slotLabel('supper'),
                          daySec: tomorrowDay,
                          onLeftover: ro ? undefined : () => saveAsLeftover(data.tomorrowMeal!.id, data.tomorrowMeal!.title),
                          onRemove: ro ? undefined : () => removeMealFromPlan(data.tomorrowMeal!.id, data.tomorrowMeal!.title, 'supper', tomorrowDay),
                        }))
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
                        detail.open(buildMeal(m, detailCtx, {
                          color: mealPrefs.color(m.slot),
                          slotLabel: slotLabel(m.slot),
                          daySec: tomorrowDay,
                          onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
                          onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot, tomorrowDay),
                        }))
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
                <Section label={t.board.toFinish} icon="arrow-counter-clockwise-bold" tint="var(--sage)" help={help} helpKey="toFinish">
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
                <Section label={t.board.todos} icon="check-bold" tint="var(--terracotta)" help={help} helpKey="todos">
                  {todayTodos.map(todoAct)}
                  <TodoSection title={t.todos.title} members={data.members} bento={false} />
                </Section>
              )
              // « À venir » — upcoming events/chores (null when none).
              nodes.upcoming = (upcomingEvents.length > 0 || upcomingChores.length > 0 || upcomingHome.length > 0) ? (
                <Section label={t.board.upcoming} icon="calendar-blank-bold" tint="var(--sky)" help={help} helpKey="upcoming">
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
              nodes.voyage = <VoyageCard />
              // « Les carnets » — the long-jeu heads-up; hides itself when nothing's near.
              nodes.carnets = <CarnetsCard />
              // « Cette saison » — recurring upkeep due before the season turns; self-hides.
              nodes.seasonUpkeep = <SeasonUpkeepCard />
              // Family drawings strip (#14) — its own full-width band (CSS column-span).
              nodes.drawings = <Notes notes={data.notes ?? []} members={data.members} variant="drawings" action={galleryLink} />
              // « Photo du jour » band (the wonder photo also backs the weather hero).
              nodes.photos = <PhotoFrame />
              // Render the visible cards in this device's order.
              return visibleCardOrder(boardCards).map((id) => <Fragment key={id}>{nodes[id]}</Fragment>)
            })()}
          </div>
        </>
      )}

      {/* « L'auto » glance is placed per-view: the Grille view renders it at the TOP
          of its grid (above « Aujourd'hui »); the Mois (calendar) view renders it
          inside its day panel (so it follows the selected date). #28 */}

      {stale && <p className="board__synced mono">{t.board.offline}</p>}
      {surface === 'mobile' && <ProfilePicker open={profileOpen} onClose={() => setProfileOpen(false)} />}
      {eventActions.node}
    </main>
  )
}
