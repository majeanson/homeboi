import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, InlineIcon, type IconName } from '../components/Icon'
import { HelpDot } from '../components/HelpDot'
import { SectionIntro } from '../components/SectionIntro'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useProfile } from '../lib/profile'
import { useTabParam } from '../lib/tabParam'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../lib/dnd'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday, formatDay, weekdayShort, dayNum } from '../lib/format'
import { addLocalDays } from '../lib/localDay'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { PantryTab } from '../components/kitchen/PantryTab'
import { ReserveSection } from '../components/kitchen/ReserveSection'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeShop } from '../components/kitchen/useRecipeShop'
import { useMealSuggest, type MealSuggestion, type SuggestSource } from '../components/kitchen/useMealSuggest'
import { type LowRow, type MealsData, type MealIdeasData, type LeftoversData, type DayNotesData, type PantryData, type ReserveData, type WeekDay, MEALS_KEY, DAY_NOTES_KEY, MEAL_IDEAS_KEY, LEFTOVERS_KEY, PANTRY_KEY, USE_SOON_KEY, RESERVE_KEY } from '../components/kitchen/types'
import { MealIdeas } from '../components/kitchen/MealIdeas'
import { Leftovers } from '../components/kitchen/Leftovers'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { reschedule } from '../components/kitchen/mealMutations'
import { SIDE_SLOTS, SLOT_ICON_NAME } from '../lib/mealSlots'
import { useMealPrefs } from '../lib/mealPrefs'
import { tintInk, faint, hairline } from '../lib/colors'
import { useKitchenActions, NO_KITCHEN_ACTIONS } from '../lib/kitchenActions'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The page owns the queries (one unauth
// gate for all), the week grid, and the layout; the FLOWS live as hooks beside
// the tab components in src/components/kitchen/* (useMealPlanning = type/pick a
// supper + the AI staples step, useRecipeShop = shop-the-week, useMealSuggest =
// supper ideas, useAiWake = the shared cold-start/AI-off truth).

// Each suggestion card wears the SAME glyph + colour as the ＋ Add-sheet tile that
// produced it (AI = marigold sparkle, book = terracotta book, use-it-up = sage
// carrot), so a result reads as "this is the answer to the button I just pressed".
const SUGGEST_DRESS: Record<SuggestSource, { icon: IconName; color: string }> = {
  ai: { icon: 'sparkle-bold', color: '#D9842A' },
  book: { icon: 'book-open-bold', color: '#C2563A' },
  useup: { icon: 'carrot-bold', color: '#6B8A52' },
}

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
  // The full per-day editor (add/remove/reorder meals, the staples step, the day
  // note, clear the day) lives on its own full-screen scene now — /kitchen/day/:date
  // (DayPlanPage). This page is the calm read-only week glance: a row's pencil and
  // the ＋ "Planifier un repas" day picker both navigate there. The grid keeps only
  // its day→day drag (the shared `reschedule` helper) and the toddler kid-suggest.

  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })
  const dayNotesQ = useQuery({ queryKey: DAY_NOTES_KEY, queryFn: () => api<DayNotesData>('day-notes'), ...live })
  const pantry = useQuery({ queryKey: PANTRY_KEY, queryFn: () => api<PantryData>('pantry'), ...live })
  const useSoonQ = useQuery({ queryKey: USE_SOON_KEY, queryFn: () => api<{ soon: LowRow[] }>('use-soon'), ...live })
  const reserveQ = useQuery({ queryKey: RESERVE_KEY, queryFn: () => api<ReserveData>('reserve'), ...live })
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })
  const ideasQ = useQuery({ queryKey: MEAL_IDEAS_KEY, queryFn: () => api<MealIdeasData>('meal-ideas'), ...live })
  const leftoversQ = useQuery({ queryKey: LEFTOVERS_KEY, queryFn: () => api<LeftoversData>('meal-leftovers'), ...live })
  // Shares the ['board'] cache with the Board/Liste pages — read only for the
  // shopping list, used to rank recipes by "what you could cook now".
  const boardQ = useQuery({
    queryKey: ['board'],
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
  // The recipe a planned meal points at (exact recipe_id link first, else a loose
  // title match) — shared with the day editor via useRecipeForMeal.
  const recipeForMeal = useRecipeForMeal(recipes)
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const soonItems = useMemo(() => (useSoonQ.data?.soon ?? []).map((s) => s.item), [useSoonQ.data])
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
  // date+slot → its planned meals, in order (a slot holds several now). Server
  // already orders by position; this just filters the flat list.
  const mealsFor = (date: number, slot: string) => days.filter((d) => d.date === date && d.slot === slot)
  // date → its day note (the per-day memo), if any.
  const noteFor = (date: number) => dayNotesQ.data?.notes?.find((n) => n.date === date)

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
  const { kidSuggest } = useMealPlanning(ai, profileId)
  const { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, toggleAllShop, confirmShop, shoppableCount } =
    useRecipeShop(days, recipeForMeal, listItems)
  const suggest = useMealSuggest(recipes, ai, lowItems, listItems, soonItems)
  // How many shop items are currently ticked (the panel starts all-unchecked, so
  // this drives the "Ajouter (N)" label + disables the confirm until ≥1 is picked).
  const shopChecked = (shopPrompt ?? []).filter((o) => o.on).length

  // The week-actions (shop / AI / book / use-it-up) run from the ＋ Add sheet, whose
  // result lands HERE at the top of the Repas tab. If the page is scrolled down to
  // the week grid, that landing is off-screen and the tap reads as "nothing
  // happened". So every action bumps a tick that scrolls the results band into view
  // (showing the ⏳ AI wake-up immediately, then the card). See the wrapped handlers
  // passed to registerKitchen below.
  const resultsRef = useRef<HTMLDivElement>(null)
  const [scrollTick, setScrollTick] = useState(0)
  const requestScroll = () => setScrollTick((n) => n + 1)
  useEffect(() => {
    if (scrollTick) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollTick])

  // The week's three actions (shop the week / AI ideas / ideas from the book) now
  // live inside the ＋ Add sheet, not as a floating rail. The sheet is rendered by
  // HubLayout (a sibling of this page), so register the live handlers + their
  // availability up to it. Only while the Repas tab is the parent view — that's
  // where each action's result (the shop chips / the suggestion card) appears.
  const { register: registerKitchen } = useKitchenActions()
  const kitchenActionsActive = kitTab === 'meals' && audience === 'parent'
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
            // Wrap each flow so it ALSO scrolls its result into view — the sheet
            // closes over the page, and the answer otherwise lands above the fold.
            shop: () => {
              beginShopWeek()
              requestScroll()
            },
            ai: () => {
              suggest.suggestAi()
              requestScroll()
            },
            book: () => {
              suggest.suggestFromRecipes()
              requestScroll()
            },
            useup: () => {
              suggest.suggestUseUp()
              requestScroll()
            },
          }
        : null,
      kitchenActionsActive
        ? {
            active: true,
            canShop: shoppableCount > 0,
            canAiSuggest: !suggest.aiOff,
            aiBusy: suggest.aiBusy,
            hasRecipes: suggest.hasRecipes,
            canUseUp: suggest.hasUseUp,
          }
        : NO_KITCHEN_ACTIONS,
    )
  }, [
    kitchenActionsActive,
    shoppableCount,
    suggest.aiOff,
    suggest.aiBusy,
    suggest.hasRecipes,
    suggest.hasUseUp,
    beginShopWeek,
    suggest.suggestAi,
    suggest.suggestFromRecipes,
    suggest.suggestUseUp,
    registerKitchen,
  ])
  // Clear the shell's kitchen actions once, when La cuisine unmounts — so leaving
  // for another tab never leaves stale tiles in the ＋ sheet.
  useEffect(() => () => registerKitchen(null, NO_KITCHEN_ACTIONS), [registerKitchen])

  // Keep a suggestion (AI text, or a real recipe link) into the ideas pool. Takes
  // the specific card now that several can be on screen at once.
  async function keepSuggestion(s: MealSuggestion) {
    await api('meal-ideas', {
      method: 'POST',
      body: { title: s.title, recipeId: s.recipe?.id ?? null, suggestedBy: profileId },
    }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEAL_IDEAS_KEY })
  }

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
      <main className="kitchen today-feed">
        <div className="app-head">
          <div>
            <div className="hand-tag">{t.kitchen.plan}</div>
            <div className="app-head__titlerow">
              <h1 className="greet">{t.kitchen.title}</h1>
              <HelpDot card="kitchen" />
            </div>
          </div>
          <div className="avatar" style={{ background: 'var(--terracotta-wash)' }}>
            <Icon name="carrot-bold" size={26} color="var(--terracotta-deep)" />
          </div>
        </div>

        <SectionIntro card="kitchen" />

        <div className="subtabs" role="tablist" aria-label={t.kitchen.title}>
          {([
            ['meals', t.kitchen.tabMeals],
            ['pantry', t.kitchen.tabPantry],
            ['recipes', t.kitchen.tabRecipes],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={kitTab === key}
              className={'subtabs__opt' + (kitTab === key ? ' is-on' : '')}
              onClick={() => setKitTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {kitTab === 'meals' && (
        <section>
          <div className="kitchen__head">
            <h2>{t.kitchen.week}</h2>
          </div>

          {/* The week's three actions (shop the week / AI ideas / ideas from the
              book) moved INTO the ＋ Add sheet as icon tiles (see useKitchenActions
              above) — no more floating rail. Their results land in THIS band, which
              every action scrolls into view (requestScroll) so a tap is never a
              silent no-op when the page is scrolled down to the grid. Several cards
              can stack — press AI then Book and you see both answers at once. */}
          <div className="kitchen__results" ref={resultsRef}>
            {aiWaking && (
              <p className="kitchen__ai-waking mono" role="status">
                ⏳ {t.kitchen.aiWaking}
              </p>
            )}
            {suggest.cards.map((s) => {
              const dress = SUGGEST_DRESS[s.source]
              return (
                <div
                  key={s.source}
                  className="kitchen__suggestion"
                  role="status"
                  style={{ borderLeftColor: dress.color }}
                >
                  <span className="kitchen__suggestion-text">
                    {/* The source glyph in its own colour — the card echoes the tile
                        that produced it, so the answer is self-labelling. */}
                    <InlineIcon name={dress.icon} size={18} color={dress.color} /> {s.title}
                    {s.source === 'book' && (s.missing ?? 0) > 0 && (
                      <span className="mono kitchen__suggestion-sub"> · {t.recipes.missingN(s.missing!)}</span>
                    )}
                    {s.source === 'useup' && (s.uses ?? 0) > 0 && (
                      <span className="mono kitchen__suggestion-sub"> · {t.recipes.usesN(s.uses!)}</span>
                    )}
                  </span>
                  <span className="kitchen__suggestion-actions">
                    {/* Re-ask the SAME source right here — another idea without
                        re-opening the ＋ Add sheet. AI re-asks step through its batch
                        (1 call / 10), the recipe sources cycle their ranked list. */}
                    <button
                      type="button"
                      className="btn btn--ghost mono"
                      onClick={() => suggest.again(s.source)}
                      disabled={s.source === 'ai' && (suggest.aiBusy || suggest.aiOff)}
                    >
                      🔁 {t.kitchen.suggestMore}
                    </button>
                    {s.recipe && (
                      <button
                        type="button"
                        className="btn btn--ghost mono"
                        onClick={() => nav(`/kitchen/recipe/${s.recipe!.id}`)}
                      >
                        {t.kitchen.suggestOpen}
                      </button>
                    )}
                    <button type="button" className="btn btn--ghost mono" onClick={() => keepSuggestion(s)}>
                      ＋ {t.kitchen.suggestKeep}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost mono kitchen__suggestion-dismiss"
                      onClick={() => suggest.clear(s.source)}
                      aria-label={t.common.close}
                    >
                      <Icon name="x-bold" size={16} />
                    </button>
                  </span>
                </div>
              )
            })}
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
                        <button
                          key={o.item}
                          type="button"
                          className={`chip${o.on ? ' is-on' : ''}`}
                          onClick={() => toggleShop(o.item)}
                          aria-pressed={o.on}
                          title={o.item}
                        >
                          <InlineIcon name={o.on ? 'check-square-bold' : 'square-bold'} /> {o.item}
                        </button>
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
              // The lighter slots as their own colour-coded chips (déjeuner / dîner /
              // collation), reusing the per-slot meal colours + icons (mealSlots +
              // Réglages ▸ Repas). Each visible slot with meals becomes one chip that
              // WRAPS at full card width — never clipped behind the Gérer cue, unlike
              // the old single ellipsized line. Hidden slots drop off. Full per-slot
              // editing still lives in the Gérer sheet.
              const sideRows = SIDE_SLOTS.filter((s) => mealPrefs.isVisible(s))
                .map((s) => ({ slot: s, titles: mealsFor(date, s).map((m) => m.title).join(', ') }))
                .filter((r) => r.titles)
              return (
              <li
                key={date}
                data-dnd-zone={String(date)}
                className={
                  'surface kitchen__day' +
                  (isToday ? ' is-today' : '') +
                  (dow === 0 || dow === 6 ? ' is-weekend' : '') +
                  (dayDnd.over === String(date) ? ' dnd-over' : '')
                }
              >
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
                        'kitchen__day-sum-main' +
                        (showSupper ? ' kitchen__day-drag' : '') +
                        (showSupper && dayDnd.activeId === String(date) ? ' is-dragging' : '')
                      }
                      onPointerDown={
                        showSupper
                          ? (e) => dayDnd.start(String(date), suppers.map((m) => m.title).join(' · '), e)
                          : undefined
                      }
                      role={showSupper ? 'button' : undefined}
                      aria-label={showSupper ? t.kitchen.dragDay : undefined}
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
                </div>
              </li>
              )
            })}
          </ul>
          <DragGhost ghost={dayDnd.ghost} />

          {/* The per-day editor is a full-screen scene now (/kitchen/day/:date,
              DayPlanPage) — a row's pencil and the ＋ "Planifier un repas" day
              picker both navigate there. No in-page sheet to render here. */}

          <MealIdeas
            ideas={ideasQ.data?.ideas ?? []}
            recipes={recipes}
            week={week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) }))}
            lowItems={lowItems}
            listItems={listItems}
            profileId={profileId}
          />

          {/* Restants — leftovers to finish. Quick-pick from the last few days' meals
              (server-provided `recent`, non-leftover, deduped), or type one; tap to
              plan onto a day. */}
          <Leftovers
            leftovers={leftoversQ.data?.leftovers ?? []}
            recentMeals={meals.data?.recent ?? []}
            week={week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) }))}
          />
        </section>
        )}

        {kitTab === 'pantry' && (
          <>
            <PantryTab low={low} soon={soon} />
            <ReserveSection reserve={reserveQ.data?.reserve ?? []} />
          </>
        )}

        {kitTab === 'recipes' && (
          <RecipesTab
            recipes={recipes}
            lowItems={lowItems}
            soonItems={soonItems}
            listItems={listItems}
            onView={(r) => nav(`/kitchen/recipe/${r.id}`)}
          />
        )}
      </main>
    </>
  )
}
