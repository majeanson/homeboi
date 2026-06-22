import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { PairPrompt } from '../components/Fallback'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { WelcomeCard } from '../components/WelcomeCard'
import { CercleBirthdays } from '../components/cercle/CercleBirthdays'
import { AutoCard } from '../components/board/AutoCard'
import { Icon, InlineIcon } from '../components/Icon'
import { CATS, TOD_ICON } from '../lib/cats'
import { wash, tintInk } from '../lib/colors'
import { useMealPrefs } from '../lib/mealPrefs'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { useProfile } from '../lib/profile'
import { ProfilePicker } from '../components/ProfilePicker'
import { readBoardView, saveBoardView, type BoardView } from '../lib/boardview'
import { useSpeak } from '../lib/speak'
import { timeOfDay } from '../lib/timeofday'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { weatherIcon, weatherTint, weatherTip, type Weather, type DayOutlook } from '../lib/weather'
import { formatDay, formatDayMaybeYear, formatTime } from '../lib/format'
import { todayLocalDay, addLocalDays, daysUntilLocal } from '../lib/localDay'
import { pictoFor } from '../lib/picto'
import { imgUrl } from '../lib/image'
import { SLOT_ICON_NAME, SLOT_RANK, slotLabel as slotLabelFor, type MealSlot } from '../lib/mealSlots'
import { Act, Section } from '../components/board/Act'
import { PhotoFrame } from '../components/board/PhotoFrame'
import { Notes } from '../components/board/Notes'
import { DayNote } from '../components/board/DayNote'
import { BoardViewToggle, MemberSwitcher } from '../components/board/chrome'
import { NowNext, Lanes } from '../components/board/views'
import { MonthView } from '../components/board/MonthView'
import { nameOf, colorOf, type ChoreInstance, type EventRow, type MealRow } from '../components/board/types'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildEvent, buildChore, buildLeftover, buildMeal, type DetailCtx } from '../components/detail/adapters'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { useBoardData, useTagColors } from '../lib/queryHooks'

// The wall board. Polls the whole board in one read on an interval. ZERO AI on
// this path. Tolerates wifi loss: a failed poll keeps the last good frame and
// flips a "showing cache" stamp instead of blanking. The day's list empties
// and stays empty — no counters, no score for clearing it. The alternate views
// (Now & Next, per-person lanes) and the card/section atoms live in
// src/components/board/*.
import { BOARD_KEY, TODOS_KEY } from '../lib/queryKeys'
import { TodoSection } from '../components/todos/TodoSection'
import { type TodosData, todosKey, todosPath } from '../lib/todos'
import { useUndoToast, useRecordUndo } from '../lib/toast'
import { isGuest } from '../lib/device'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { BOARD_HELP } from '../lib/boardHelp'

// Cut-off minute-of-day after which each meal slot is considered "past". Once the
// clock passes this threshold the board strikes through that slot's row so it's
// visually clear it's already been — breakfast at 10:30, lunch at 14:00, etc.
const SLOT_PAST_MIN: Partial<Record<string, number>> = {
  breakfast: 10 * 60 + 30,
  lunch: 14 * 60,
  snack: 17 * 60,
  supper: 21 * 60,
}

// Keep the greeting on one line beside the help dot + section icon: a long
// display name collapses to its initials (split on spaces/hyphens, e.g.
// "Marie-Christine" → "MC"), so "Bonne soirée, …" never wraps or overflows.
const greetName = (name: string) =>
  name.length > 10
    ? name.split(/[\s-]+/).filter(Boolean).map((p) => p[0]!.toUpperCase()).join('') || name
    : name

export function Board() {
  const t = useT()
  const undo = useUndoToast()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  const qc = useQueryClient()
  const ro = isGuest()
  const { lang } = useLang()
  const { audience } = useAudience()
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
  // The board layout for this device (bento | next | lanes), remembered locally.
  const [view, setView] = useState<BoardView>(() => readBoardView())
  // Contextual "?" help for the view toggle (lib/helpMode): arm it, tap a view to
  // learn what it shows instead of switching. Label = the view's own name.
  const help = useHelpMode(BOARD_HELP, (k) => t.boardView[k.replace('view-', '') as 'bento' | 'next' | 'lanes' | 'month'] ?? k)
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
  const unauth = isUnauthorized(error)
  const stale = isError && !unauth && !!data

  // Weather is its own slow poll (15 min) off the render-critical board read, and
  // resolves to null when there's no postal / upstream is down → the chip hides.
  const FIFTEEN_MIN = 15 * 60 * 1000
  const { data: wx } = useQuery({
    queryKey: ['weather'],
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'),
    refetchInterval: FIFTEEN_MIN,
    staleTime: FIFTEEN_MIN,
  })
  const weather = wx?.weather ?? null
  const tomorrowWx = wx?.tomorrow ?? null
  const tip = weatherTip(weather)

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
  const todayEvents = (data?.today ?? []).filter(mineEvent)
  const todayChores = (data?.choresToday ?? []).filter(mineChore).filter((c) => !pendingDone.has(c.id))
  const todayTodos = (data?.todos ?? []).filter(mineChore).filter((c) => !pendingDone.has(c.id))
  const tomorrowEvents = (data?.tomorrow ?? []).filter(mineEvent)
  const upcomingEvents = (data?.upcoming ?? []).filter(mineEvent)
  const upcomingChores = (data?.choresUpcoming ?? []).filter(mineChore)
  // "Projets & Entretien" (home_projects) dated occurrences — family-wide (no
  // rotation), so not personal-focus filtered. Minus any just checked (held undo).
  const todayHome = (data?.homeToday ?? []).filter((c) => !pendingDone.has(c.id))
  const upcomingHome = data?.homeUpcoming ?? []
  // Undated leftovers to finish — a calm "eat these first" nudge. Family-wide (not
  // personal-focus filtered), minus any just marked Fini (held behind the undo).
  const leftovers = (data?.leftovers ?? []).filter((l) => !pendingLeftover.has(l.id))

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
      // tell things apart; fall back to a pin when nothing matches.
      icon: pictoFor(e.title, '📌'),
      label: e.title,
      sub: e.all_day ? t.board.allDay : formatTime(e.start_at, lang),
      narration: e.title,
      color: memberColor(e.member_id) ?? undefined,
    }))

  if (audience === 'toddler') {
    const tod = timeOfDay(Date.now())

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
            {/* One-off to-dos, read aloud too — a parent checks them off in the
                parent board; here a pre-reader just sees what's left to do. */}
            {kidSection(
              t.board.todos,
              todayTodos.map((c) => ({
                key: c.id,
                icon: pictoFor(c.title, '✅'),
                label: c.title,
                sub: c.who ?? undefined,
                narration: c.title,
                color: c.color ?? undefined,
              })),
            )}
            {/* À compléter (todos) — read aloud too; a parent checks them off in the
                parent board, here a pre-reader just sees what's left to complete. */}
            {kidSection(
              t.todos.title,
              openTodos.map((td) => ({
                key: td.id,
                icon: pictoFor(td.title, '✅'),
                label: td.title,
                narration: td.title,
                color: memberColor(td.member_id) ?? undefined,
              })),
            )}
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
          </>
        )}
      </main>
    )
  }

  // Parent board, Pip "Today" layout: a handwritten tag + greeting, an "Up next"
  // now-card (tonight's supper), then a gentle grouped timeline of colour-coded
  // activity cards. Same data + writes as before — just the calm Pip surface.
  const tod = timeOfDay(Date.now())
  // LOCAL midnight of "today" — the calendar's day key, matching the server's
  // local-day bucketing (lib/monthgrid + /api/month). UTC midnight flipped a day
  // ahead every evening (~8 PM Eastern), so "today" highlighted tomorrow's cell.
  const todayDay = todayLocalDay()
  // What the adapters (components/detail/adapters) need to resolve faces + copy.
  // recipeFor lets a tapped meal show its recipe photo + ingredient glance.
  const detailCtx: DetailCtx = { t, lang, members: data?.members ?? [], recipeFor, tagColors }
  const tomorrowDay = addLocalDays(todayDay, 1)
  // Current minute-of-day used to strike through meals whose slot time has passed.
  const nowMinOfDay = new Date().getHours() * 60 + new Date().getMinutes()
  const isSlotPast = (slot: string) => nowMinOfDay > (SLOT_PAST_MIN[slot] ?? Infinity)
  const eventWhen = (e: EventRow) =>
    e.birthday ? (e.age != null ? t.cercle.turnsN(e.age) : t.board.birthday) : e.all_day ? t.board.allDay : formatTime(e.start_at, lang)
  // À venir hint: append "· dans X jours" (demain / aujourd'hui) when an upcoming
  // item is within 3 days, so a glance sees how close it is, not just the date.
  // Beyond 3 days the date alone is calm enough; past/today items get nothing here.
  const withRel = (when: string, at: number): string => {
    const d = daysUntilLocal(at)
    return d >= 0 && d < 3 ? `${when} · ${t.cercle.inDaysN(d)}` : when
  }
  const eventAct = (e: EventRow) => (
    <Act
      key={e.id}
      cat={e.birthday ? 'birthday' : 'event'}
      title={e.title}
      when={eventWhen(e)}
      who={memberName(e.member_id) ?? undefined}
      color={memberColor(e.member_id) ?? undefined}
      mine={!!profileId && e.member_id === profileId}
      soon={e.soon}
      onOpen={() => detail.open(buildEvent(e, detailCtx))}
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
      onCheck={withDay ? undefined : () => markChoreDone(c)}
      onOpen={() => detail.open(buildChore(c, detailCtx, { upcoming: withDay, onDone: withDay ? undefined : () => markChoreDone(c) }))}
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
      onCheck={() => markTodoDone(c)}
      onOpen={() => detail.open(buildChore(c, detailCtx, { todo: true, onDone: () => markTodoDone(c) }))}
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
  const homeAct = (c: ChoreInstance, withDay?: boolean) => (
    <Act
      key={c.id}
      cat="chore"
      title={c.title}
      when={withDay ? withRel(formatDayMaybeYear(c.at, lang), c.at) : undefined}
      color={c.color ?? undefined}
      soon={c.soon}
      onCheck={withDay ? undefined : () => markHomeDone(c)}
      onOpen={() => detail.open(buildChore(c, detailCtx, { upcoming: withDay, onDone: withDay ? undefined : () => markHomeDone(c) }))}
    />
  )

  return (
    <main className="board-wall">
      {/* No per-page add button: the shared yellow ＋ FAB (HubLayout) floats
          bottom-right here just like every other tab. */}
      {/* Time-of-day icon sits top-right as the section's identity (and, in
          tutorial mode, the Guide link); the view toggle + profile chip drop to
          their own row below so the avatar never reads as part of the filter. */}
      <HubHead
        title={me ? `${t.today[tod]}, ${greetName(me.display_name)}` : t.today[tod]}
        icon={TOD_ICON[tod]}
        iconColor="var(--marigold-deep)"
        background="var(--marigold-wash)"
        card="board"
      />

      {/* Board controls: today's date + who's at this phone + which of the four
          views, all on one row under the avatar (the date rides beside the view
          selector rather than on its own line under the greeting). */}
      <div className="board-controls">
        <span className="board-controls__date mono">{formatDay(Math.floor(Date.now() / 1000), lang)}</span>
        {surface === 'mobile' && (
          <button
            type="button"
            className="profile-chip"
            onClick={() => setProfileOpen(true)}
            aria-label={t.profile.who}
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

      <SectionIntro card="board" />

      {/* Shared kiosk: a one-tap face row to switch between Maisonnée (everyone)
          and an individual member — so anyone at the wall tablet can quickly act
          as themselves, then tap Maisonnée (or their face again) to step back. */}
      {surface === 'kiosk' && data && data.members.length > 0 && (
        <MemberSwitcher members={data.members} t={t} />
      )}

      {/* No "Vue de <nom>" stamp: the profile chip / member switcher above
          already shows whose view this is (the selected face), so the label was
          redundant. Picking the face again (or Maisonnée) clears the filter. */}

      {/* A fresh household: the first-run setup checklist + the feature map, so a
          newcomer has a clear next step AND can see everything the app does. It
          auto-hides once the steps are done (or dismissed). */}
      {data && <WelcomeCard members={data.members} />}

      {/* Fridge notes (text / voice / photo) ride above the day in every parent
          view. DRAWINGS are split out to the Grille/bento view only (below) — they
          deserve room and shouldn't crowd the compact Next/Lanes/Month layouts. */}
      {data && <Notes notes={data.notes ?? []} members={data.members} variant="notes" />}

      {/* Today's day note (the per-day memo from La cuisine) rides here too, in
          every view — read-only on the wall, edited in the kitchen. Skipped in the
          Calendar (Mois) view: its day panel already shows today's note below, so
          this top copy would just repeat it. */}
      {view !== 'month' && data?.dayNote && <DayNote note={data.dayNote} members={data.members} />}

      {/* Upcoming birthdays from « Le cercle » — a calm strip above the day, in
          every parent view (renders nothing when none are near). */}
      <CercleBirthdays />

      {!data ? (
        <p className="loading mono">{t.common.loading}</p>
      ) : view === 'next' ? (
        <NowNext data={data} lang={lang} t={t} profileId={profileId} todos={openTodos} />
      ) : view === 'lanes' ? (
        <>
          {/* « L'auto » rides below the fridge note (rendered above the view) and
              above the per-person lanes table, as a full-width strip. #28 */}
          <AutoCard />
          <Lanes data={data} lang={lang} t={t} profileId={profileId} todos={openTodos} />
        </>
      ) : view === 'month' ? (
        <MonthView members={data.members} lang={lang} t={t} todayDay={todayDay} />
      ) : (
        <>
          {/* The "today" zone: tonight's supper and today's weather as equal hero
              cards (mirrors the toddler heroes row), so weather has a real bubble
              instead of hiding in the timestamp line. The dressing tip rides under
              the temperature where it's actionable. */}
          {(tonightMeals.length > 0 || weather) && (
            <div className="board-heroes">
              {/* "Ce soir" lists EVERY supper planned for today — a day can hold more
                  than one. Each carries the souper food icon (no carrot, no emoji)
                  and the souper colour (Réglages ▸ Repas). */}
              {tonightMeals.map((m) => {
                const openSupper = () =>
                  detail.open(buildMeal(m, detailCtx, {
                    color: supperColor,
                    slotLabel: t.board.tonight,
                    daySec: todayDay,
                    onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
                    onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot ?? 'supper', todayDay),
                  }))
                return (
                <div
                  key={m.id}
                  className="now-card now-card--tap"
                  style={{ background: wash(supperColor!), color: tintInk(supperColor!) }}
                  role="button"
                  tabIndex={0}
                  onClick={openSupper}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openSupper()
                    }
                  }}
                >
                  <div className="blob" style={{ background: supperColor }} />
                  <div className="label">{t.board.tonight}</div>
                  <div className="what">{m.title}</div>
                  {/* A planned leftover reads as "Restants" so the glance shows it's
                      a finish-the-fridge supper, not a fresh cook. */}
                  {m.is_leftover ? (
                    <div className="who">
                      <InlineIcon name="arrow-counter-clockwise-bold" size={13} /> {t.kitchen.leftoversTag}
                    </div>
                  ) : null}
                  {cookLine(m) && <div className="who">{cookLine(m)}</div>}
                  <div className="icn">
                    <Icon name={SLOT_ICON_NAME.supper} size={40} color={supperColor} />
                  </div>
                </div>
                )
              })}
              {weather && (
                <div className="now-card now-card--wx" style={{ background: CATS.event.wash, color: CATS.event.deep }}>
                  <div className="blob" style={{ background: CATS.event.color }} />
                  <div className="label">{t.weather[weather.bucket]}</div>
                  <div className="what">{weather.tempC}°</div>
                  {tip && <div className="who">{t.weather.tip[tip]}</div>}
                  <div className="icn" aria-hidden="true">
                    <Icon name={weatherIcon(weather)} size={38} color={weatherTint(weather)} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="board-grid">
            {/* « L'auto » glance — the car's status today + today's rides — rides at
                the TOP of the grid as a full-width band, just above « Aujourd'hui »
                and below the weather heroes. #28 */}
            <AutoCard />

            <Section label={t.board.today}>
            {todayEvents.length === 0 && todayChores.length === 0 && todayHome.length === 0 && otherMeals.length === 0 ? (
              <EmptyState tone="calm">{t.board.todayClear}</EmptyState>
            ) : (
              <>
                {/* Today's other meals (déjeuner/dîner/collation) — supper is the
                    "Ce soir" hero above, so the rest of the day's table shows here.
                    Each carries its slot food icon so the slots read apart at a
                    glance, like La cuisine. */}
                {otherMeals.map((m) => (
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
                ))}
                {todayEvents.map(eventAct)}
                {/* Recurring chores due today — tap to check off (advances the turn). */}
                {todayChores.map((c) => choreAct(c))}
                {/* Projets & Entretien due today — tap to check off (stamps done). */}
                {todayHome.map((c) => homeAct(c))}
              </>
            )}
          </Section>

          {/* Demain rides directly under today — the second-most-important glance
              (what's coming + prep-ahead), above the day's standing lists. */}
          <Section label={t.board.tomorrow}>
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
            {tomorrowEvents.length === 0 && !showTomorrowSupper && otherTomorrowMeals.length === 0 && !data.tomorrowNote && tomorrowTodoCount === 0 && (
              <EmptyState tone="calm">{t.board.tomorrowClear}</EmptyState>
            )}
          </Section>

          {/* Restants à finir — undated leftovers, a calm "eat these first" nudge.
              Tap the check to mark one Fini (eaten). Hidden when the pool is empty. */}
          {leftovers.length > 0 && (
            <Section label={t.kitchen.leftoversBoard}>
              {leftovers.map((l) => (
                <Act
                  key={l.id}
                  cat="meal"
                  icon="arrow-counter-clockwise-bold"
                  when={t.kitchen.leftoversTag}
                  title={l.title}
                  onCheck={() => markLeftoverDone(l)}
                  onOpen={() => detail.open(buildLeftover(l, detailCtx, {
                    onDone: () => markLeftoverDone(l),
                    onPlanTonight: ro ? undefined : () => planLeftoverTonight(l.id, l.title),
                  }))}
                />
              ))}
            </Section>
          )}

          {/* One-off to-dos — captured "corvées" / standing tasks with no schedule.
              Tap to check off (drops away). Hidden when there are none. */}
          {todayTodos.length > 0 && (
            <Section label={t.board.todos}>
              {todayTodos.map(todoAct)}
            </Section>
          )}

          {/* À compléter — standalone check-off todos (global + today), distinct
              from the loose-chore "À faire" above. Check in place, "Effacer
              cochées", and one-tap departure checklists (templates). */}
          <TodoSection title={t.todos.title} members={data.members} />

          {(upcomingEvents.length > 0 || upcomingChores.length > 0 || upcomingHome.length > 0) && (
            <Section label={t.board.upcoming}>
              {upcomingEvents.map((e) => (
                <Act
                  key={e.id}
                  cat={e.birthday ? 'birthday' : 'event'}
                  title={e.title}
                  when={withRel(eventWhen(e), e.start_at)}
                  soon={e.soon}
                  onOpen={() => detail.open(buildEvent(e, detailCtx))}
                />
              ))}
              {/* Recurring chores coming up later this week, with their day. */}
              {upcomingChores.map((c) => choreAct(c, true))}
              {/* Projets & Entretien coming up this week, with their day. */}
              {upcomingHome.map((c) => homeAct(c, true))}
            </Section>
          )}

            {/* Family drawings (#14) live only here in the Grille view, just above
                the photos — tap one to add to it. Kept off the compact
                Next/Lanes/Month layouts. The door to the lasting collection
                ("Mes dessins") rides as a trailing chip inside the strip rather
                than on its own row. */}
            <Notes notes={data.notes ?? []} members={data.members} variant="drawings" action={galleryLink} />

            <PhotoFrame />
          </div>
        </>
      )}

      {/* « L'auto » glance is now placed per-view: the Grille (bento) view renders it
          at the TOP of its grid (above « Aujourd'hui »); the Maintenant view renders it
          inside NowNext (above the À compléter footer); the per-person lanes view above
          its table; the Mois (calendar) view inside its day panel (so it follows the
          selected date). #28 */}

      {stale && <p className="board__synced mono">{t.board.offline}</p>}
      {surface === 'mobile' && <ProfilePicker open={profileOpen} onClose={() => setProfileOpen(false)} />}
    </main>
  )
}
