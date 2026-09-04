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
import { live } from '../lib/query'
import { BOARD_KEY } from '../lib/queryKeys'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../lib/dnd'
import { PairPrompt } from '../components/Fallback'
import { Skeleton } from '../components/Skeleton'
import { formatDay, weekdayShort, dayNum } from '../lib/format'
import { addLocalDays, todayLocalDay } from '../lib/localDay'
import { pictoFor } from '../lib/picto'
import { ideasForDay } from '../lib/mealIdeas'
import { useMeals, useRecipes, useDayNotes, usePantry, useLeftovers } from '../lib/queryHooks'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { HistoryTab } from '../components/kitchen/HistoryTab'
import { PantryTab } from '../components/kitchen/PantryTab'
import { ReserveSection } from '../components/kitchen/ReserveSection'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeShop } from '../components/kitchen/useRecipeShop'
import { type LowRow, type MealIdeasData, type ReserveData, type WeekDay, MEAL_IDEAS_KEY, USE_SOON_KEY, RESERVE_KEY } from '../components/kitchen/types'
import { type IdeasChip } from '../components/kitchen/IdeasDrawer'
import { MealIdeas } from '../components/kitchen/MealIdeas'
import { Leftovers, usePlanLeftover } from '../components/kitchen/Leftovers'
import { weekDates, useWeekLabeled } from '../components/kitchen/week'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { reschedule, planMeal, planMealRecipe } from '../components/kitchen/mealMutations'
import { EntityCombobox, type ComboOption } from '../components/EntityCombobox'
import { mealPickOptions, type MealPick } from '../components/kitchen/comboOptions'
import { isGuest } from '../lib/device'
import { SLOT_ICON_NAME, WINDOW_DAYS_DEFAULT } from '../lib/mealSlots'
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
// source (the old inline AI/book/use-it-up suggestion band + the Leftovers pool)
// into the ONE IdeasDrawer, opened from the grid or the ＋ sheet — but the kept
// « Idées de repas » pool itself stays INLINE under the week grid (<MealIdeas>, the
// same component the drawer's first source renders), since it's the one a family
// adds to daily. « Plus d'idées » opens the drawer for the other four sources.

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
  // Tapping a meal row goes STRAIGHT to the full recipe view (/kitchen/recipe/:id,
  // like the board's meal rows) — every action a peek in between might offer
  // (Ajouter à la liste, En routine pour enfant, Partager) already lives on that
  // view. See RecipesTab's onView below.
  // #43 — "Cuisiner ensemble" (cook 2+ of today's dishes at once) now lives inside
  // the ＋ "Cuisiner" picker (AddSheet), beside the single-dish choices — not as a
  // standalone button up here.
  // The full per-day editor (add/remove/reorder meals, the day note, clear the
  // day) lives on its own full-screen scene now — /kitchen/day/:date
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
  const recipes = useMemo(() => recipesQ.data?.recipes ?? [], [recipesQ.data])
  // The recipe book + the per-day editor are routes now (/kitchen/recipe/*,
  // /kitchen/day/:date) — openers navigate instead of toggling local overlay state.
  // Parent kitchen sub-tab: one job at a time so the page isn't an endless scroll.
  // Held in the URL (?tab=) so it survives the return from a full-screen add/edit
  // scene — add a recipe from Recettes and you come back to Recettes. See tabParam.
  const [kitTab, setKitTab] = useTabParam('tab', 'meals', ['meals', 'pantry', 'recipes', 'history'] as const)
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
      history: t.kitchen.tabHistory,
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
  // Recipes + Restants as one grouped dropdown for the empty-day quick planner —
  // the SAME builder the day editor's slot fields use, so the two doors can't drift.
  const leftoverPool = useMemo(() => leftoversQ.data?.leftovers ?? [], [leftoversQ.data])
  const mealOpts = useMemo(
    () => mealPickOptions(recipes, lowItems, listItems, leftoverPool, t),
    [recipes, lowItems, listItems, leftoverPool, t],
  )
  const planLeftover = usePlanLeftover()
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
  // The household's « Jours affichés », rolling from today (see functions/api/meals.ts
  // and _lib/mealSlots). WINDOW_DAYS_DEFAULT is only the not-yet-loaded fallback.
  const windowDays = meals.data?.windowDays ?? WINDOW_DAYS_DEFAULT
  const low = pantry.data?.low ?? []
  const soon = useSoonQ.data?.soon ?? []

  // Build the grid from weekStart (today) across the window's days. The HERO slot
  // is the day's primary meal (the headline, the
  // shop-the-week driver, the kid-suggestion target) — the souper unless the
  // household picked another in Réglages ▸ Repas — so the grid + week shape stay
  // keyed on it; the other slots ride alongside in the household's order.
  // weekDates steps by LOCAL calendar days (DST-safe) — see components/kitchen/week.ts,
  // shared with the Idées scene so the two never disagree about which days exist.
  const heroSlot = mealPrefs.hero
  // No payload (cold load bails to <Loading/> below; a hard error with an empty
  // cache lands here) → no grid rather than a week anchored at weekStart 0 (1970).
  const week: WeekDay[] = !meals.data
    ? []
    : weekDates(weekStart, windowDays).map((date) => ({
        date,
        meal: days.find((d) => d.date === date && d.slot === heroSlot),
      }))
  // The same window as `{date,label}` day chips — what the inline « Idées de repas »
  // pool plans onto. Same source and DST-safe stepping as the grid above.
  const weekLabeled = useWeekLabeled(weekStart, windowDays, lang)
  // date+slot → its planned meals, in order (a slot holds several now). Server
  // already orders by position; this just filters the flat list.
  const mealsFor = (date: number, slot: string) => days.filter((d) => d.date === date && d.slot === slot)
  // date → its day note (the per-day memo), if any.
  const noteFor = (date: number) => dayNotesQ.data?.notes?.find((n) => n.date === date)

  // Each meal row is BOTH a tap target (straight to its recipe) and the day's drag
  // handle (no separate grip glyph anymore — see the week grid below). We guard
  // against the drag: a pointerdown that then moves >6px is a reschedule, not a
  // tap, so it doesn't also navigate.
  const tapDownRef = useRef<{ x: number; y: number } | null>(null)
  const boardMembers = boardQ.data?.members ?? []

  // Drag a day's hero meal to another day — the calm week-grid gesture. Each day cell
  // is a drop zone keyed by its date; the hero headline is the drag handle. A day
  // can hold several hero meals, so moving the headline moves them ALL to the target
  // day (the intuitive "move this day's supper plan"). Touch-friendly, so it works
  // on the wall tablet, not just a mouse.
  const dayDnd = usePointerDnd({
    onDrop: (fromKey, toKey) => {
      const from = Number(fromKey)
      const to = Number(toKey)
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return
      for (const m of mealsFor(from, heroSlot)) reschedule(qc, m.id, to, heroSlot)
    },
    canDrop: (fromKey, toKey) => fromKey !== toKey,
    // Press-and-hold to move a day's plan — a calm, deliberate gesture, not a flick.
    holdMs: DND_HOLD_MS,
  })

  // The week-action flows (shop / suggest) + the toddler kid-suggest. The per-day
  // meal editing moved to DayPlanPage; this page keeps only kidSuggest (the toddler
  // taps a recipe then an empty day — a suggestion, not a decision).
  const { kidSuggest } = useMealPlanning(profileId)
  const { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, toggleAllShop, confirmShop, shoppableCount } =
    useRecipeShop(days, recipeForMeal, listItems)
  // How many shop items are currently ticked (the panel starts all-unchecked, so
  // this drives the "Ajouter (N)" label + disables the confirm until ≥1 is picked).
  const shopChecked = (shopPrompt ?? []).filter((o) => o.on).length

  // The week-actions (shop / ＋ Idées) run from the ＋ Add sheet, whose result lands
  // HERE at the top of the Repas tab (shop) or opens the IdeasDrawer (idées). If the
  // page is scrolled down to the week grid, an inline landing is off-screen and the
  // tap reads as "nothing happened". So shop bumps a tick that scrolls the results
  // band into view. See the wrapped handlers passed to registerKitchen below.
  const resultsRef = useRef<HTMLDivElement>(null)
  // The ONE « Idées » drawer (C-14) is a full-screen scene now (/kitchen/idees) —
  // reachable from the grid opener below AND the ＋ Add sheet's « Idées » tile. The
  // source rides in ?tab=: the 👧 empty-day-tile chip deep-links straight to 'kid'
  // (a glance chip never commits a plan — it just lands on that source).
  const openIdeas = (chip: IdeasChip = 'ideas') =>
    nav(chip === 'ideas' ? '/kitchen/idees' : `/kitchen/idees?tab=${chip}`)
  // Inline day planning (plan seam #8): an empty day cell IS the field. One open at
  // a time (the grid stays a calm glance, not seven input boxes); the day scene keeps
  // everything else. A read-only guest sees the plain « À planifier » cue instead.
  const planRo = isGuest()
  const [planDate, setPlanDate] = useState<number | null>(null)
  const [planText, setPlanText] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const openPlan = (date: number) => {
    setPlanDate(date)
    setPlanText('')
  }
  const closePlan = () => {
    setPlanDate(null)
    setPlanText('')
  }
  async function commitPlan(date: number) {
    const v = planText.trim()
    if (!v || planBusy) {
      if (!v) closePlan() // an empty commit (or a blur with nothing typed) just closes
      return
    }
    setPlanBusy(true)
    try {
      await planMeal(qc, date, heroSlot, v)
      closePlan()
    } catch {
      /* keep the typed title so it can be retried (same rule as the grocery bar) */
    } finally {
      setPlanBusy(false)
    }
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
            // « Idées » navigates to its own scene — no tab jump or scroll is needed
            // (it takes the whole viewport, whichever sub-tab you fired it from).
            ideas: () => nav('/kitchen/idees'),
          }
        : null,
      kitchenActionsActive ? { active: true, canShop: shoppableCount > 0 } : NO_KITCHEN_ACTIONS,
    )
  }, [kitchenActionsActive, shoppableCount, beginShopWeek, setKitTab, registerKitchen, nav])
  // Clear the shell's kitchen actions once, when La cuisine unmounts — so leaving
  // for another tab never leaves stale tiles in the ＋ sheet.
  useEffect(() => () => registerKitchen(null, NO_KITCHEN_ACTIONS), [registerKitchen])

  if (unauth) return <PairPrompt />
  // Plan seam #6 (friction audit): on a genuinely cold first paint there is no
  // meals payload yet, so `weekStart ?? 0` anchored the grid at the epoch and the
  // page flashed a January-1970 week. Hold the shared loading pattern until the
  // real anchor arrives — the persisted cache restores it before first paint on a
  // warm start, and a failed poll keeps the last good frame (TanStack), so this
  // only ever shows on the true cold load the flash came from.
  // The grid's shape is known before its data is (N day cells), so reserve them
  // rather than popping a whole week in over one centred line.
  if (!meals.data && !meals.error) return <Skeleton variant="card" count={4} />

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
            { key: 'history', label: t.kitchen.tabHistory },
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
        {tabHelp.bubbleFor('history')}

        {kitTab === 'meals' && (
        <section>
          {/* « Magasiner la semaine » still lives in the ＋ Add sheet (see
              useKitchenActions above); its result lands in THIS band, scrolled into
              view (requestScroll) so a tap from another sub-tab is never a silent
              no-op. Every other week action (AI ideas / book ideas / use-it-up /
              vide-frigo) moved INTO the IdeasDrawer's source chips (C-14) — the ONE
              polite live region below only ever announces the shop panel now. */}
          <div className="kitchen__results" ref={resultsRef} aria-live="polite">
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
              const suppers = mealsFor(date, heroSlot) // a day can hold several
              const showSupper = mealPrefs.isVisible(heroSlot) && suppers.length > 0
              const supperColor = mealPrefs.color(heroSlot)
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
              const sideRows = mealPrefs.sideSlots
                .filter((s) => mealPrefs.isVisible(s))
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
                {/* The date + the edit door stick as the pill's header — its ONLY
                    two jobs are "which day" and "manage it"; the meals scroll below.
                    Today/tomorrow get a relative tag; today's whole card lights up
                    so "you are here" reads at a glance in the countdown. */}
                <div className="kitchen__day-head">
                  <span className="kitchen__day-date" aria-label={formatDay(date, lang)}>
                    {rel && <span className="kitchen__day-rel mono">{rel}</span>}
                    <span className="kitchen__day-dow mono" aria-hidden="true">{weekdayShort(date, lang)}</span>
                    <span className="kitchen__day-num" aria-hidden="true">{dayNum(date, lang)}</span>
                  </span>
                  {/* A small, icon-only edit button — the lone door that opens the
                      day's full editor, landing on its « Repas » face (?vue=repas —
                      a kitchen door means meals). No "Gérer" label: the pencil says
                      it and keeps the header tiny. */}
                  <button
                    type="button"
                    className="kitchen__day-manage"
                    onClick={() => nav(`/kitchen/day/${date}?vue=repas`)}
                    aria-label={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                    title={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                  >
                    <Icon name="pencil-simple-bold" size={16} />
                  </button>
                </div>
                {/* Calm, read-only glance — each supper its OWN row (icon + title,
                    like the board's « Ce soir »), not one agglomerated line. A single
                    tap goes straight to that meal's recipe; the other slots ride
                    below as colour chips. Full editing lives in the day scene. */}
                <div className="kitchen__day-body">
                  {planDate === date && !planRo ? (
                    // Plan the day's hero meal RIGHT HERE — type free text, or pick
                    // a recipe / Restant from the SAME dropdown the day editor's slot
                    // fields use (mealOpts), so the two doors can't drift. Filling a
                    // week used to cost seven full-screen day scenes (friction audit,
                    // plan seam #8); the scene still owns the rest (sides, note, cook).
                    <EntityCombobox
                      className="kitchen__day-add"
                      value={planText}
                      onChange={setPlanText}
                      options={mealOpts}
                      onPick={(o: ComboOption<MealPick>) => {
                        closePlan()
                        if (o.data.kind === 'recipe') planMealRecipe(qc, date, heroSlot, o.data.recipe)
                        else void planLeftover(o.data.leftover, date, heroSlot)
                      }}
                      onSubmit={() => commitPlan(date)}
                      onCancel={closePlan}
                      noMatchLabel={t.combo.noMatch}
                      frequentsKey="meal"
                      autoFocus
                      busy={planBusy}
                      placeholder={t.kitchen.planPlaceholder}
                      ariaLabel={`${t.kitchen.planShort} · ${formatDay(date, lang)}`}
                    />
                  ) : showSupper ? (
                    <div className={'kitchen__day-meals' + (dayDnd.activeId === String(date) ? ' is-dragging' : '')}>
                      {suppers.map((m) => {
                        const r = recipeForMeal(m)
                        // A recipe-linked meal opens straight to its recipe (the
                        // book-icon door, one tap); a free-text one falls back to
                        // the day's full editor — there's nothing else to show it.
                        const go = () => nav(r ? `/kitchen/recipe/${r.id}` : `/kitchen/day/${date}?vue=repas`)
                        return (
                          <div
                            key={m.id}
                            className="kitchen__day-meal"
                            role="button"
                            tabIndex={0}
                            onPointerDown={(e) => {
                              // Remember where the press began so the click below can
                              // tell a tap (open the recipe) from a drag (reschedule).
                              // No visible grip anymore — the row itself is the handle.
                              tapDownRef.current = { x: e.clientX, y: e.clientY }
                              dayDnd.start(String(date), suppers.map((s) => s.title).join(' · '), e)
                            }}
                            onClick={(e) => {
                              const d = tapDownRef.current
                              if (d && (Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6)) return
                              go()
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                go()
                              }
                            }}
                            // Only override the accessible name for a recipe-linked
                            // meal — it names where the tap goes. A free-text one falls
                            // back to the day editor, and just reads as its title (its
                            // own text content); an explicit "Gérer · <titre>" here
                            // would collide with the header's own "Gérer" pencil.
                            aria-label={r ? `${t.recipes.open} · ${m.title}` : undefined}
                            title={t.kitchen.dragDay}
                          >
                            {/* The hero slot icon in its slot colour — the same icon +
                                colour the chips and Réglages ▸ Repas use, not a bare dot. */}
                            <Icon name={SLOT_ICON_NAME[heroSlot]} size={18} color={supperColor} />
                            <span className="kitchen__day-meal-title">{m.title}</span>
                            {m.is_leftover ? (
                              <span className="kitchen__meal-tag mono">
                                <InlineIcon name="arrow-counter-clockwise-bold" size={12} /> {t.kitchen.leftoversTag}
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : planRo ? (
                    <span className="kitchen__day-sum-empty mono">{t.kitchen.planShort}</span>
                  ) : (
                    <button type="button" className="kitchen__day-sum-empty mono" onClick={() => openPlan(date)}>
                      <InlineIcon name="plus-bold" size={12} /> {t.kitchen.planShort}
                    </button>
                  )}
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

          {/* « Restants » — its own section under the week grid, ABOVE the ideas pool:
              what's already cooked and still to finish is read before what to cook
              next. Same shared <Leftovers> the drawer's 🧊 « À écouler » source
              renders, so the two can't drift. It owns the "leftovers" help bubble via
              its heading (the old one-line hint beside « Plus d'idées » is gone — the
              section itself IS the affordance now). */}
          <Leftovers
            leftovers={leftoversQ.data?.leftovers ?? []}
            recentMeals={meals.data?.recent ?? []}
            week={weekLabeled}
            help={tabHelp}
          />

          {/* The kept « Idées de repas » pool, back under the week grid where the
              week is read — the pool you add to daily shouldn't cost a scene. It is
              the SAME <MealIdeas> the drawer's first source renders, so the two can
              never drift. C-14 moved the OTHER idea sources (⭐ 🤖 👧) away, not
              this one. The pool owns the "ideas" help bubble via its heading. */}
          <MealIdeas
            ideas={ideasQ.data?.ideas ?? []}
            recipes={recipes}
            week={weekLabeled}
            lowItems={lowItems}
            listItems={listItems}
            profileId={profileId}
            help={tabHelp}
          />

          {/* C-14 — the ONE « Idées » drawer opener, reachable here AND from the ＋
              Add sheet. It reads « Plus d'idées » beside the inline pools: the drawer
              is where the OTHER sources live (⭐ Favoris, 🧊 À écouler, 🤖 IA, 👧
              Proposé par). */}
          <Cluster className="kitchen__ideas-opener">
            <button type="button" className="btn btn--primary" onClick={() => openIdeas('ideas')}>
              <InlineIcon name="bowl-food-bold" /> {t.kitchen.ideasMore}
            </button>
          </Cluster>
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

        {kitTab === 'history' && (
          // « Historique » — every planned meal since the beginning, newest day
          // first, grouped by month. Cold-path paged read (its own query); the
          // board members already on hand feed the day peek's cook names, and
          // the labeled countdown window feeds the « Encore ? » plan picker.
          <HistoryTab members={boardMembers} week={weekLabeled} />
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
      {/* C-14 — the ONE Idées drawer + « Vide-frigo » live on the /kitchen/idees
          scene now (IdeasPage), reached from the grid opener above and the ＋ Add
          sheet's « Idées » tile (useKitchenActions). Nothing to render here. */}
    </>
  )
}
