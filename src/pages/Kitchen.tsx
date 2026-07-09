import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, InlineIcon } from '../components/Icon'
import { HubHead } from '../components/HubHead'
import { SubTabs } from '../components/SubTabs'
import { Chip } from '../components/Chip'
import { Cluster } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { SectionIntro } from '../components/SectionIntro'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useProfile } from '../lib/profile'
import { useTabParam } from '../lib/tabParam'
import { api, isUnauthorized } from '../lib/api'
import { useAi } from '../lib/ai'
import { live } from '../lib/query'
import { BOARD_KEY } from '../lib/queryKeys'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../lib/dnd'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday, formatDay, weekdayShort, dayNum } from '../lib/format'
import { addLocalDays, todayLocalDay } from '../lib/localDay'
import { pictoFor } from '../lib/picto'
import { ideasForDay } from '../lib/mealIdeas'
import { useMeals, useRecipes, useDayNotes, usePantry, useLeftovers } from '../lib/queryHooks'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { PantryTab } from '../components/kitchen/PantryTab'
import { ReserveSection } from '../components/kitchen/ReserveSection'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeShop } from '../components/kitchen/useRecipeShop'
import { type LowRow, type MealIdeasData, type ReserveData, type WeekDay, MEAL_IDEAS_KEY, USE_SOON_KEY, RESERVE_KEY } from '../components/kitchen/types'
import { IdeasDrawer, type IdeasChip } from '../components/kitchen/IdeasDrawer'
import { EmptyFridgeSheet } from '../components/kitchen/EmptyFridgeSheet'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { reschedule } from '../components/kitchen/mealMutations'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildDay } from '../components/detail/adapters'
import { SIDE_SLOTS, SLOT_ICON_NAME, SLOT_TIME_ORDER } from '../lib/mealSlots'
import { useMealPrefs } from '../lib/mealPrefs'
import { tintInk, faint, hairline } from '../lib/colors'
import { useKitchenActions, NO_KITCHEN_ACTIONS } from '../lib/kitchenActions'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { KITCHEN_TAB_HELP } from '../lib/kitchenTabHelp'
import { scrollBehavior } from '../lib/motion'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The page owns the queries (one unauth
// gate for all), the week grid, and the layout; the FLOWS live as hooks beside
// the tab components in src/components/kitchen/* (useMealPlanning = type/pick a
// supper + the AI staples step, useRecipeShop = shop-the-week, useAiWake = the
// shared cold-start/AI-off truth). C-14 folded every "what's for supper" idea
// source (the old inline AI/book/use-it-up suggestion band + the MealIdeas/
// Leftovers pools) into the ONE IdeasDrawer, opened from the grid or the ＋ sheet.

export function Kitchen() {
  const t = useT()
  const qc = useQueryClient()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { memberId: profileId } = useProfile()
  // Per-slot meal visibility (Réglages ▸ Repas) trims the week's side-summary
  // glance. The full per-slot editor (DayPlanPage) still shows every slot, so a
  // hidden slot can always be planned from a day's pencil.
  const mealPrefs = useMealPrefs()
  const nav = useNavigate()
  // The day-glance peek (buildDay) still uses the shared entity-detail sheet.
  // Tapping a recipe card, though, goes STRAIGHT to the full recipe view
  // (/kitchen/recipe/:id) — no intermediate peek — since every action the peek
  // offered (Ajouter à la liste, En routine pour enfant, Partager) now lives on
  // that view. See RecipesTab's onView below.
  const detail = useEntityDetail()
  // #43 — "Cuisiner ensemble" (cook 2+ of today's dishes at once) now lives inside
  // the ＋ "Cuisiner" picker (AddSheet), beside the single-dish choices — not as a
  // standalone button up here.
  // The full per-day editor (add/remove/reorder meals, the staples step, the day
  // note, clear the day) lives on its own full-screen scene now — /kitchen/day/:date
  // (DayPlanPage). This page is the calm read-only week glance: a row's pencil and
  // the ＋ "Planifier un repas" day picker both navigate there. The grid keeps only
  // its day→day drag (the shared `reschedule` helper) and the toddler kid-suggest.

  const meals = useMeals()
  const dayNotesQ = useDayNotes()
  const pantry = usePantry()
  const useSoonQ = useQuery({ queryKey: USE_SOON_KEY, queryFn: () => api<{ soon: LowRow[] }>('use-soon'), ...live })
  const reserveQ = useQuery({ queryKey: RESERVE_KEY, queryFn: () => api<ReserveData>('reserve'), ...live })
  const recipesQ = useRecipes()
  const ideasQ = useQuery({ queryKey: MEAL_IDEAS_KEY, queryFn: () => api<MealIdeasData>('meal-ideas'), ...live })
  const leftoversQ = useLeftovers()
  // Shares the ['board'] cache with the Board/Liste pages — read only for the
  // shopping list, used to rank recipes by "what you could cook now".
  const boardQ = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ list: { text: string }[]; members?: { id: string; display_name: string }[] }>('board'),
    ...live,
  })
  const recipes = recipesQ.data?.recipes ?? []
  // The recipe book + the per-day editor are routes now (/kitchen/recipe/*,
  // /kitchen/day/:date) — openers navigate instead of toggling local overlay state.
  // Parent kitchen sub-tab: one job at a time so the page isn't an endless scroll.
  // Held in the URL (?tab=) so it survives the return from a full-screen add/edit
  // scene — add a recipe from Recettes and you come back to Recettes. See tabParam.
  const [kitTab, setKitTab] = useTabParam('tab', 'meals', ['meals', 'pantry', 'recipes'] as const)
  // Contextual "?" help mode for the WHOLE tab (shared hook): arm it once at the
  // sub-tab nav, then tap a tab OR any sub-section heading below (Idées de repas,
  // Restants, Il en manque, La réserve, Recettes, Collections) to learn what that
  // concept is in place instead of acting on it. One page-level instance, threaded
  // down into the sub-tab components so their headings (HelpTitle) become pickable.
  const tabHelpLabel = (k: string) =>
    ({
      meals: t.kitchen.tabMeals,
      pantry: t.kitchen.tabPantry,
      recipes: t.kitchen.tabRecipes,
      ideas: t.kitchen.ideas,
      leftovers: t.kitchen.leftovers,
      low: t.kitchen.low,
      useSoon: t.kitchen.useSoon,
      reserve: t.kitchen.reserve,
      recipesBook: t.recipes.title,
      collections: t.recipes.collectionsTitle,
      search: t.search.title,
    })[k] ?? k
  const tabHelp = useHelpMode(KITCHEN_TAB_HELP, tabHelpLabel)
  // The recipe a planned meal points at (exact recipe_id link first, else a loose
  // title match) — shared with the day editor via useRecipeForMeal.
  const recipeForMeal = useRecipeForMeal(recipes)
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const soonItems = useMemo(() => (useSoonQ.data?.soon ?? []).map((s) => s.item), [useSoonQ.data])
  // La réserve item names — the secondary "also on hand" signal the vide-frigo flow
  // folds in alongside use-soon (anti-waste).
  const reserveItems = useMemo(() => (reserveQ.data?.reserve ?? []).map((r) => r.item), [reserveQ.data])
  // #12 "Haven't had in a while": recipe id → the most recent local-midnight day a
  // meal linked to it (recipe_id, migration 0024) was *served*. Built from the meals
  // the page already holds — the 10-day window (`days`) plus the recent-history
  // tail (`recent`) — so it needs NO new query. The `days` window is a FORWARD
  // countdown, so we keep only rows dated today-or-earlier: a meal merely PLANNED for
  // a future day isn't "served" and must not sink the recipe in the Oubliées sort. A
  // recipe absent here is treated by rankNeglected as never-served-recently → it
  // leads "Oubliées". The server's suggest-meal prompt does the authoritative
  // full-history version; this is the calm client affordance over the data on hand.
  const lastServedById = useMemo(() => {
    const m = new Map<string, number>()
    const today = todayLocalDay()
    const rows = [...(meals.data?.days ?? []), ...(meals.data?.recent ?? [])]
    for (const r of rows) {
      if (!r.recipe_id || r.date > today) continue
      const prev = m.get(r.recipe_id)
      if (prev == null || r.date > prev) m.set(r.recipe_id, r.date)
    }
    return m
  }, [meals.data])
  const unauth = isUnauthorized(meals.error) || isUnauthorized(pantry.error)
  const days = meals.data?.days ?? []
  const weekStart = meals.data?.weekStart ?? 0
  // 10-day countdown block, re-anchored each Tuesday; the count shrinks 10 → 4
  // across the week (see functions/api/meals.ts). 10 is the just-loaded fallback.
  const windowDays = meals.data?.windowDays ?? 10
  const low = pantry.data?.low ?? []
  const soon = useSoonQ.data?.soon ?? []

  // Build the countdown grid from weekStart (today) across the remaining days of
  // the 10-day block. The SOUPER is the day's primary meal (the headline, the
  // shop-the-week driver, the kid-suggestion target), so the grid + week shape
  // stay keyed on it; the other slots ride alongside.
  const week: WeekDay[] = Array.from({ length: windowDays }, (_, i) => {
    // Step by LOCAL calendar days, not fixed 86 400 s: meals are bucketed at local
    // midnight (functions/_lib/ids localDayStart), and a local day is 23 h/25 h
    // across a DST change — plain arithmetic would land those days at 23:00/01:00
    // and `days.find` would miss them, showing/saving meals a cell off twice a year.
    const date = addLocalDays(weekStart, i)
    const meal = days.find((d) => d.date === date && d.slot === 'supper')
    return { date, meal }
  })
  // The week as { date, label } pairs — what MealPlanPicker/IdeasDrawer's day
  // chips need. Built once, reused by every planner (was inlined at each call site).
  const weekLabeled = useMemo(
    () => week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) })),
    [week, lang],
  )
  // date+slot → its planned meals, in order (a slot holds several now). Server
  // already orders by position; this just filters the flat list.
  const mealsFor = (date: number, slot: string) => days.filter((d) => d.date === date && d.slot === slot)
  // date → its day note (the per-day memo), if any.
  const noteFor = (date: number) => dayNotesQ.data?.notes?.find((n) => n.date === date)

  // Tapping a day cell opens an INFORMATIVE day peek (the whole day's meals + note),
  // distinct from the pencil that opens the planner — Marc's ask: in La cuisine the
  // tap informs, the edit button plans. We guard against the drag: a pointerdown that
  // then moves >6px is a reschedule, not a tap, so it doesn't also open the peek.
  const tapDownRef = useRef<{ x: number; y: number } | null>(null)
  const boardMembers = boardQ.data?.members ?? []
  const openDayPeek = (date: number) => {
    const nameById = (id: string | null) => (id ? boardMembers.find((m) => m.id === id)?.display_name ?? null : null)
    const dayMeals = SLOT_TIME_ORDER.filter((s) => mealPrefs.isVisible(s)).flatMap((s) =>
      mealsFor(date, s).map((m) => ({ slot: t.kitchen.slots[s], title: m.title, cook: nameById(m.cook_member_id) })),
    )
    const rel = date === weekStart ? t.kitchen.todayShort : date === addLocalDays(weekStart, 1) ? t.kitchen.tomorrowShort : null
    const label = (rel ? `${rel} · ` : '') + formatDay(date, lang).replace(/^./, (c) => c.toUpperCase())
    detail.open(
      buildDay({ t, lang, members: [] }, { label, accent: mealPrefs.color('supper'), meals: dayMeals, note: noteFor(date)?.text ?? null }),
    )
  }

  // Drag a day's souper to another day — the calm week-grid gesture. Each day cell
  // is a drop zone keyed by its date; the souper headline is the drag handle. A day
  // can hold several suppers, so moving the headline moves them ALL to the target
  // day (the intuitive "move this day's supper plan"). Touch-friendly, so it works
  // on the wall tablet, not just a mouse.
  const dayDnd = usePointerDnd({
    onDrop: (fromKey, toKey) => {
      const from = Number(fromKey)
      const to = Number(toKey)
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return
      for (const m of mealsFor(from, 'supper')) reschedule(qc, m.id, to, 'supper')
    },
    canDrop: (fromKey, toKey) => fromKey !== toKey,
    // Press-and-hold to move a day's plan — a calm, deliberate gesture, not a flick.
    holdMs: DND_HOLD_MS,
  })

  // The week-action flows (shop / suggest) + the toddler kid-suggest. The per-day
  // meal editing moved to DayPlanPage; this page keeps only kidSuggest (the toddler
  // taps a recipe then an empty day — a suggestion, not a decision).
  const ai = useAiWake()
  const { aiWaking } = ai
  // Global AI on/off (binding present AND household hasn't switched it off). Folds
  // into canAiSuggest so the AI-ideas tile / re-ask is hidden when AI is off — the
  // reactive aiOff (a runtime 503) still disables it the same way.
  const { enabled: aiEnabled } = useAi()
  const { kidSuggest } = useMealPlanning(ai, profileId)
  const { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, toggleAllShop, confirmShop, shoppableCount } =
    useRecipeShop(days, recipeForMeal, listItems)
  // How many shop items are currently ticked (the panel starts all-unchecked, so
  // this drives the "Ajouter (N)" label + disables the confirm until ≥1 is picked).
  const shopChecked = (shopPrompt ?? []).filter((o) => o.on).length

  // The week-actions (shop / ＋ Idées) run from the ＋ Add sheet, whose result lands
  // HERE at the top of the Repas tab (shop) or opens the IdeasDrawer (idées). If the
  // page is scrolled down to the week grid, an inline landing is off-screen and the
  // tap reads as "nothing happened". So shop bumps a tick that scrolls the results
  // band into view (showing the ⏳ AI wake-up immediately, then the panel). See the
  // wrapped handlers passed to registerKitchen below.
  const resultsRef = useRef<HTMLDivElement>(null)
  // « Vide-frigo » (#5) — its own two-step sheet (ideas → recipes), opened from the
  // IdeasDrawer's footer button rather than dropping an inline card.
  const [fridgeOpen, setFridgeOpen] = useState(false)
  // The ONE « Idées » drawer (C-14) — reachable from the grid opener below AND the
  // ＋ Add sheet's « Idées » tile. `ideasChip` picks which source chip it opens ON:
  // the 👧 empty-day-tile chip jumps straight to 'kid' (a glance chip never commits
  // a plan — it just opens the drawer there).
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [ideasChip, setIdeasChip] = useState<IdeasChip>('ideas')
  const openIdeas = (chip: IdeasChip = 'ideas') => {
    setIdeasChip(chip)
    setIdeasOpen(true)
  }
  const [scrollTick, setScrollTick] = useState(0)
  const requestScroll = () => setScrollTick((n) => n + 1)
  useEffect(() => {
    if (scrollTick) resultsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }, [scrollTick])

  // The week's two actions (shop the week / ＋ Idées) live inside the ＋ Add sheet,
  // not as a floating rail. The sheet is rendered by HubLayout (a sibling of this
  // page), so register the live handlers + their availability up to it.
  const { register: registerKitchen } = useKitchenActions()
  // The ＋ week-actions are offered on EVERY parent kitchen sub-tab, not just Repas —
  // "all the section's actions, whatever sub-tab you're on". Their results still land
  // on the Repas grid, so a handler fired from Garde-manger/Recettes first switches
  // to Repas (see the wrapped handlers below), then scrolls the result into view.
  const kitchenActionsActive = audience === 'parent'
  // Push the current week-action availability up to the shell's ＋ Add sheet.
  // IDEMPOTENT by design: it only ever registers the CURRENT state (active
  // handlers + flags, or cleared when inactive), and HubLayout bails when the flag
  // VALUES are unchanged — so re-running on an unstable dep is a harmless no-op.
  // It deliberately has NO per-run cleanup: a cleanup that flipped the flags to
  // all-false on every re-run (with the setup flipping them back) was TWO real
  // state changes per render, which ping-ponged HubLayout↔Kitchen into an infinite
  // re-render and froze the tree mid-navigation (you couldn't leave La cuisine).
  // Clearing on the way out is a separate, unmount-only effect below.
  useEffect(() => {
    registerKitchen(
      kitchenActionsActive
        ? {
            // Shop jumps to the Repas sub-tab (where its result renders) and scrolls
            // it into view — the action can now fire from any sub-tab, and the sheet
            // closing over the page would otherwise land the answer above the fold.
            // setKitTab is a no-op when Repas is already showing.
            shop: () => {
              setKitTab('meals')
              beginShopWeek()
              requestScroll()
            },
            // « Idées » just opens the drawer — it's a modal overlay, so no tab jump
            // or scroll is needed (it reads the same from any sub-tab).
            ideas: () => openIdeas('ideas'),
          }
        : null,
      kitchenActionsActive ? { active: true, canShop: shoppableCount > 0 } : NO_KITCHEN_ACTIONS,
    )
  }, [kitchenActionsActive, shoppableCount, beginShopWeek, setKitTab, registerKitchen])
  // Clear the shell's kitchen actions once, when La cuisine unmounts — so leaving
  // for another tab never leaves stale tiles in the ＋ sheet.
  useEffect(() => () => registerKitchen(null, NO_KITCHEN_ACTIONS), [registerKitchen])

  if (unauth) return <PairPrompt />

  if (audience === 'toddler') {
    return (
      <KidKitchen
        week={week}
        recipes={recipes}
        recipeFor={recipeForMeal}
        onSuggest={kidSuggest}
        // "Start its recipe": a planned meal a toddler taps opens Cook mode —
        // big one-step-at-a-time pages that read themselves aloud (its own route).
        onStartRecipe={(r) => nav(`/kitchen/recipe/${r.id}/cook`)}
      />
    )
  }

  return (
    <>
      <main className={'kitchen today-feed' + (tabHelp.active ? ' help-armed' : '')}>
        <HubHead
          title={t.kitchen.title}
          icon="carrot-bold"
          iconColor="var(--terracotta-deep)"
          background="var(--terracotta-wash)"
          card="kitchen"
          searchPick={(run) => tabHelp.pick('search', run)}
        />
        {tabHelp.bubbleFor('search')}

        <SectionIntro card="kitchen" />

        <SubTabs
          options={[
            { key: 'meals', label: t.kitchen.tabMeals },
            { key: 'pantry', label: t.kitchen.tabPantry },
            { key: 'recipes', label: t.kitchen.tabRecipes },
          ]}
          value={kitTab}
          onSelect={setKitTab}
          pick={tabHelp.pick}
          armed={tabHelp.active}
          ariaLabel={t.kitchen.title}
          tour="kitchen-tabs"
          trailing={tabHelp.available && <HelpToggle active={tabHelp.active} onToggle={tabHelp.toggle} />}
        />
        {tabHelp.hint && <HelpHint />}
        {/* The sub-tab bubbles render HERE (next to the nav). Heading bubbles render
            next to their own heading via bubbleFor, so a concept explained deep in
            the page doesn't pop up off-screen at the top. */}
        {tabHelp.bubbleFor('meals')}
        {tabHelp.bubbleFor('pantry')}
        {tabHelp.bubbleFor('recipes')}

        {kitTab === 'meals' && (
        <section>
          {/* « Magasiner la semaine » still lives in the ＋ Add sheet (see
              useKitchenActions above); its result lands in THIS band, scrolled into
              view (requestScroll) so a tap from another sub-tab is never a silent
              no-op. Every other week action (AI ideas / book ideas / use-it-up /
              vide-frigo) moved INTO the IdeasDrawer's source chips (C-14) — the ONE
              polite live region below only ever announces the shop panel now. */}
          <div className="kitchen__results" ref={resultsRef} aria-live="polite">
            {aiWaking && (
              <p className="kitchen__ai-waking mono">
                ⏳ {t.kitchen.aiWaking}
              </p>
            )}
            {shopPrompt && (
              <div className="kitchen__staples kitchen__shop">
                {shopPrompt.length === 0 ? (
                  <p className="kitchen__staples-q mono">{t.kitchen.shopWeekEmpty}</p>
                ) : (
                  <>
                    <p className="kitchen__staples-q mono">
                      <InlineIcon name="shopping-bag-bold" size={16} color="#6B8A52" /> {t.kitchen.shopWeekQ}
                    </p>
                    <p className="kitchen__staples-hint mono">{t.kitchen.shopWeekHint}</p>
                    <div className="kitchen__staples-chips">
                      {shopPrompt.map((o) => (
                        <Chip key={o.item} selected={o.on} onClick={() => toggleShop(o.item)} title={o.item}>
                          <InlineIcon name={o.on ? 'check-square-bold' : 'square-bold'} /> {o.item}
                        </Chip>
                      ))}
                    </div>
                  </>
                )}
                <div className="kitchen__staples-actions">
                  {shopPrompt.length > 0 && (
                    <>
                      {/* Flip the whole list when most of it is wanted (the panel
                          starts all-unchecked now), or clear back to none. */}
                      <button type="button" className="btn btn--ghost mono" onClick={toggleAllShop}>
                        {shopPrompt.every((o) => o.on) ? t.kitchen.shopWeekNone : t.kitchen.shopWeekAll}
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary mono"
                        onClick={confirmShop}
                        disabled={shopBusy || shopChecked === 0}
                      >
                        {shopChecked > 0 ? t.kitchen.shopWeekAddN(shopChecked) : t.kitchen.shopWeekAdd}
                      </button>
                    </>
                  )}
                  <button type="button" className="btn btn--ghost mono" onClick={() => setShopPrompt(null)}>
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            )}
          </div>
          <ul className="kitchen__week">
            {week.map(({ date }) => {
              const dow = new Date(date * 1000).getDay()
              const isToday = date === weekStart
              const isTomorrow = date === addLocalDays(weekStart, 1)
              // Concise relative tag ("Auj."/"Dem.") so the tiny date badge never
              // overflows with "Aujourd'hui"/"Demain".
              const rel = isToday ? t.kitchen.todayShort : isTomorrow ? t.kitchen.tomorrowShort : null
              const suppers = mealsFor(date, 'supper') // a day can hold several
              const showSupper = mealPrefs.isVisible('supper') && suppers.length > 0
              const supperColor = mealPrefs.color('supper')
              const note = noteFor(date)
              // C-14 — an empty day with a matching kid-suggested idea (meal_ideas
              // `date` + `suggested_by`, migration 0107) surfaces a small "Léa
              // propose 🍕" chip instead of staying a bare "À planifier". Tapping it
              // opens the IdeasDrawer on 👧 Proposé par — a glance chip never commits
              // a plan on its own (decided).
              const kidIdea = !showSupper ? ideasForDay(ideasQ.data?.ideas ?? [], date)[0] : undefined
              const kidWho = kidIdea ? boardMembers.find((m) => m.id === kidIdea.suggested_by) : undefined
              // The lighter slots as their own colour-coded chips (déjeuner / dîner /
              // collation), reusing the per-slot meal colours + icons (mealSlots +
              // Réglages ▸ Repas). Each visible slot with meals becomes one chip that
              // WRAPS at full card width — never clipped behind the Gérer cue, unlike
              // the old single ellipsized line. Hidden slots drop off. Full per-slot
              // editing still lives in the Gérer sheet.
              const sideRows = SIDE_SLOTS.filter((s) => mealPrefs.isVisible(s))
                .map((s) => ({ slot: s, titles: mealsFor(date, s).map((m) => m.title).join(', ') }))
                .filter((r) => r.titles)
              // Standardized drop cue (same as La liste): a precise insertion line on
              // the edge the drag is heading toward, instead of the vague whole-cell
              // ring. Zones are keyed by date (epoch-day), so the direction test is a
              // date compare — "coming from an earlier day → land below".
              const fromDate = dayDnd.activeId != null ? Number(dayDnd.activeId) : null
              const overHere = dayDnd.over === String(date) && fromDate !== null && fromDate !== date
              const dropEdge = overHere ? (fromDate! < date ? 'bottom' : 'top') : null
              return (
              <li
                key={date}
                data-dnd-zone={String(date)}
                className={
                  'surface kitchen__day' +
                  (isToday ? ' is-today' : '') +
                  (dow === 0 || dow === 6 ? ' is-weekend' : '') +
                  (overHere ? ' is-droptarget' : '')
                }
              >
                {dropEdge && <span className={`dnd-drop dnd-drop--${dropEdge}`} aria-hidden="true" />}
                {/* Calendar-style date badge — weekday + day number, the row's left
                    anchor. Today/tomorrow get a relative tag; today's whole card
                    lights up so "you are here" reads at a glance in the countdown. */}
                <span className="kitchen__day-date" aria-label={formatDay(date, lang)}>
                  {rel && <span className="kitchen__day-rel mono">{rel}</span>}
                  <span className="kitchen__day-dow mono" aria-hidden="true">{weekdayShort(date, lang)}</span>
                  <span className="kitchen__day-num" aria-hidden="true">{dayNum(date, lang)}</span>
                </span>
                {/* Calm, read-only glance — the souper headline, the other slots as
                    colour chips, the note. The meal info is plain display (no longer
                    a giant button that hid it behind an ellipsis); only the compact
                    "Gérer" cue opens that day's editor. Full editing lives in the
                    DayManageSheet so two days still fit a phone. */}
                <div className="kitchen__day-body">
                  <div className="kitchen__day-top">
                    <span
                      className={
                        'kitchen__day-sum-main kitchen__day-sum-tap' +
                        (showSupper ? ' kitchen__day-drag' : '') +
                        (showSupper && dayDnd.activeId === String(date) ? ' is-dragging' : '')
                      }
                      onPointerDown={(e) => {
                        // Remember where the press began so the click below can tell a
                        // tap (open the peek) from a drag (reschedule — skip the peek).
                        tapDownRef.current = { x: e.clientX, y: e.clientY }
                        if (showSupper) dayDnd.start(String(date), suppers.map((m) => m.title).join(' · '), e)
                      }}
                      onClick={(e) => {
                        const d = tapDownRef.current
                        if (d && (Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6)) return
                        openDayPeek(date)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openDayPeek(date)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${t.detail.openDay} · ${formatDay(date, lang)}`}
                      title={showSupper ? t.kitchen.dragDay : undefined}
                    >
                      {showSupper ? (
                        <>
                          {/* Grip + slot icon + title on ONE line; the Restants tag drops
                              to its own line below (the column is set in CSS) so it never
                              sits to the right of the title and eats its width. */}
                          <span className="kitchen__day-sum-line">
                            {/* A drag grip so the calm headline reads as "movable" — drag
                                it onto another day to reschedule the souper. */}
                            <span className="dnd-grip mono" aria-hidden="true">⠿</span>
                            {/* The souper slot icon in its slot colour — the same icon +
                                colour the chips and Réglages ▸ Repas use, not a bare dot. */}
                            <Icon name={SLOT_ICON_NAME.supper} size={18} color={supperColor} />
                            <span className="kitchen__day-sum-titles">{suppers.map((m) => m.title).join(' · ')}</span>
                          </span>
                          {/* Flag a leftover souper on the calm glance, so "finish the
                              fridge" reads without opening the day. Below the title. */}
                          {suppers.some((m) => m.is_leftover) && (
                            <span className="kitchen__meal-tag mono">
                              <InlineIcon name="arrow-counter-clockwise-bold" size={12} /> {t.kitchen.leftoversTag}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="kitchen__day-sum-empty mono">{t.kitchen.planShort}</span>
                      )}
                    </span>
                    {/* A small, icon-only edit button — the lone tap target that
                        opens the day's editor. No "Gérer" label: the pencil says it
                        and keeps the pill tiny so meal info keeps the width. */}
                    <button
                      type="button"
                      className="kitchen__day-manage"
                      onClick={() => nav(`/kitchen/day/${date}`)}
                      aria-label={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                      title={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                    >
                      <Icon name="pencil-simple-bold" size={16} />
                    </button>
                  </div>
                  {sideRows.length > 0 && (
                    <span className="kitchen__day-slots">
                      {sideRows.map(({ slot, titles }) => {
                        const c = mealPrefs.color(slot)!
                        return (
                          <span
                            key={slot}
                            className="meal-chip"
                            style={{ color: tintInk(c), background: faint(c), borderColor: hairline(c) }}
                          >
                            <InlineIcon name={SLOT_ICON_NAME[slot]} /> {titles}
                          </span>
                        )
                      })}
                    </span>
                  )}
                  {note && (
                    <span className="kitchen__day-sum-meta mono">
                      <InlineIcon name="pencil-simple-bold" /> {note.text}
                    </span>
                  )}
                  {kidIdea && (
                    <button
                      type="button"
                      className="kitchen__day-kidsuggest mono"
                      onClick={() => openIdeas('kid')}
                    >
                      <Avatar name={kidWho?.display_name} size={18} />
                      {t.kitchen.kidProposes(kidWho?.display_name ?? '')} {pictoFor(kidIdea.title, '🍽')}
                    </button>
                  )}
                </div>
              </li>
              )
            })}
          </ul>
          <DragGhost ghost={dayDnd.ghost} />

          {/* The per-day editor is a full-screen scene now (/kitchen/day/:date,
              DayPlanPage) — a row's pencil and the ＋ "Planifier un repas" day
              picker both navigate there. No in-page sheet to render here. */}

          {/* C-14 — the ONE « Idées » drawer opener, reachable here AND from the ＋
              Add sheet. Restants keeps a slim one-line hint beside it (decided) —
              the full list lives inside the drawer's 🧊 « À écouler » chip. */}
          <Cluster className="kitchen__ideas-opener">
            <button
              type="button"
              className="btn btn--primary"
              onClick={tabHelp.pick('ideas', () => openIdeas('ideas'))}
            >
              <InlineIcon name="bowl-food-bold" /> {t.kitchen.ideas}
            </button>
            {(leftoversQ.data?.leftovers?.length ?? 0) > 0 && (
              <button
                type="button"
                className="kitchen__restants-hint mono"
                onClick={tabHelp.pick('leftovers', () => openIdeas('useSoon'))}
              >
                <InlineIcon name="arrow-counter-clockwise-bold" size={14} />{' '}
                {t.kitchen.ideasDrawer.restantsHint(leftoversQ.data!.leftovers.length)}
              </button>
            )}
          </Cluster>
          {tabHelp.bubbleFor('ideas')}
          {tabHelp.bubbleFor('leftovers')}
        </section>
        )}

        {kitTab === 'pantry' && (
          // La réserve sits between "à utiliser bientôt" and "ce qui s'achève", so
          // the running-low list reads LAST in the garde-manger.
          <PantryTab
            low={low}
            soon={soon}
            help={tabHelp}
            between={<ReserveSection reserve={reserveQ.data?.reserve ?? []} help={tabHelp} />}
          />
        )}

        {kitTab === 'recipes' && (
          // One recipe book. "Quoi cuisiner?" is a pill filter and #11 collections
          // a browse-by-tag toggle group — both live INSIDE RecipesTab now, so the
          // recipes area is a single flat view (no second-level sub-tabs). The
          // toddler lens renders KidKitchen wholesale (handled above).
          <RecipesTab
            recipes={recipes}
            lowItems={lowItems}
            soonItems={soonItems}
            listItems={listItems}
            lastServed={lastServedById}
            // Tapping a recipe card skips the old detail peek and opens the full
            // recipe view directly — every action the peek carried (Ajouter à la
            // liste, En routine pour enfant, Partager) now lives on that view.
            onView={(r) => nav(`/kitchen/recipe/${r.id}`)}
            help={tabHelp}
          />
        )}
      </main>
      {/* C-14 — the ONE Idées drawer, reachable from the grid opener above and the
          ＋ Add sheet's « Idées » tile (useKitchenActions). Its own footer button
          opens « Vide-frigo », which keeps its untouched identity below. */}
      <IdeasDrawer
        open={ideasOpen}
        onClose={() => setIdeasOpen(false)}
        initialChip={ideasChip}
        ideas={ideasQ.data?.ideas ?? []}
        leftovers={leftoversQ.data?.leftovers ?? []}
        recentMeals={meals.data?.recent ?? []}
        recipes={recipes}
        lowItems={lowItems}
        listItems={listItems}
        soonItems={soonItems}
        week={weekLabeled}
        profileId={profileId}
        ai={ai}
        aiEnabled={aiEnabled}
        onOpenFridge={() => {
          setIdeasOpen(false)
          setFridgeOpen(true)
        }}
      />
      {/* « Vide-frigo » (#5) — the two-step ideas→recipes sheet, opened from the
          IdeasDrawer footer button (or, while help mode names it, the ＋ tile). */}
      <EmptyFridgeSheet
        open={fridgeOpen}
        onClose={() => setFridgeOpen(false)}
        soonItems={soonItems}
        reserveItems={reserveItems}
      />
    </>
  )
}
