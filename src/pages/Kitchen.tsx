import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, InlineIcon } from '../components/Icon'
import { HelpDot } from '../components/HelpDot'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useProfile } from '../lib/profile'
import { useTabParam } from '../lib/tabParam'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday, formatDay, weekdayShort, dayNum } from '../lib/format'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { pictoFor } from '../lib/picto'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { PantryTab } from '../components/kitchen/PantryTab'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeShop } from '../components/kitchen/useRecipeShop'
import { useMealSuggest } from '../components/kitchen/useMealSuggest'
import { type LowRow, type MealRow, type MealsData, type MealIdeasData, type DayNotesData, type PantryData, type WeekDay, MEALS_KEY, DAY_NOTES_KEY, MEAL_IDEAS_KEY, PANTRY_KEY, USE_SOON_KEY } from '../components/kitchen/types'
import { MealIdeas } from '../components/kitchen/MealIdeas'
import { MealRows } from '../components/kitchen/MealRows'
import { RecipePickerMenu } from '../components/kitchen/RecipePickerMenu'
import { SIDE_SLOTS, SLOT_ICON_NAME } from '../lib/mealSlots'
import { useKitchenActions } from '../lib/kitchenActions'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The page owns the queries (one unauth
// gate for all), the week grid, and the layout; the FLOWS live as hooks beside
// the tab components in src/components/kitchen/* (useMealPlanning = type/pick a
// supper + the AI staples step, useRecipeShop = shop-the-week, useMealSuggest =
// supper ideas, useAiWake = the shared cold-start/AI-off truth).
export function Kitchen() {
  const t = useT()
  const qc = useQueryClient()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { memberId: profileId } = useProfile()
  const nav = useNavigate()
  // The lighter side slots (déjeuner / dîner / collation): a plain title, no
  // staples/recipe flow — that richness stays on the souper. {date,slot} being
  // edited, plus its text.
  const [editSlot, setEditSlot] = useState<{ date: number; slot: string } | null>(null)
  const [slotText, setSlotText] = useState('')
  async function saveSlot(date: number, slot: string, title: string, recipeId?: string | null) {
    const v = title.trim()
    if (!v) {
      setEditSlot(null)
      setSlotText('')
      return
    }
    try {
      await api('meals', { method: 'POST', body: { date, slot, title: v, recipeId } })
      // Only close the editor once the write lands — a failed plan keeps the
      // typed title so it can be retried (same as the grocery add bar).
      setEditSlot(null)
      setSlotText('')
    } catch {
      /* keep the editor open with the text intact */
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Wipe a planned slot entirely (the ✕ beside the picker). The editor closes and
  // the day goes back to its open "＋" state. On failure the editor stays open so
  // the action can be retried — same posture as saveSlot/saveMeal.
  async function clearMeal(id: string) {
    try {
      await api('meals', { method: 'DELETE', body: { id } })
      setEditDate(null)
      setMealText('')
      setEditSlot(null)
      setSlotText('')
    } catch {
      /* keep the editor open so the clear can be retried */
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Reorder one meal within its slot (↑/↓). The server renumbers the slot.
  async function moveMeal(id: string, dir: 'up' | 'down') {
    await api('meals', { method: 'POST', body: { action: 'move', id, dir } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }
  // Easy clearing: wipe one slot's meals, or a whole day's.
  async function clearSlotMeals(date: number, slot: string) {
    await api('meals', { method: 'POST', body: { action: 'clear', date, slot } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }
  async function clearDay(date: number) {
    await api('meals', { method: 'POST', body: { action: 'clear', date } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // A free-text memo per day (déjeuner-to-collation context that isn't a meal:
  // "souper chez mémé", "lunch froid — sortie"). One per day; editing replaces it.
  // {date} being edited, plus its text.
  const [editNote, setEditNote] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')
  async function saveNote(date: number, text: string) {
    const v = text.trim()
    if (!v) {
      setEditNote(null)
      setNoteText('')
      return
    }
    try {
      await api('day-notes', { method: 'POST', body: { date, text: v } })
      setEditNote(null)
      setNoteText('')
    } catch {
      /* keep the editor open with the text intact */
    }
    qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
  }
  async function clearNote(date: number) {
    try {
      await api('day-notes', { method: 'DELETE', body: { date } })
      setEditNote(null)
      setNoteText('')
    } catch {
      /* keep the editor open so the clear can be retried */
    }
    qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
  }

  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })
  const dayNotesQ = useQuery({ queryKey: DAY_NOTES_KEY, queryFn: () => api<DayNotesData>('day-notes'), ...live })
  const pantry = useQuery({ queryKey: PANTRY_KEY, queryFn: () => api<PantryData>('pantry'), ...live })
  const useSoonQ = useQuery({ queryKey: USE_SOON_KEY, queryFn: () => api<{ soon: LowRow[] }>('use-soon'), ...live })
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })
  const ideasQ = useQuery({ queryKey: MEAL_IDEAS_KEY, queryFn: () => api<MealIdeasData>('meal-ideas'), ...live })
  // Shares the ['board'] cache with the Board/Liste pages — read only for the
  // shopping list, used to rank recipes by "what you could cook now".
  const boardQ = useQuery({
    queryKey: ['board'],
    queryFn: () => api<{ list: { text: string }[]; members?: { id: string; display_name: string }[] }>('board'),
    ...live,
  })
  // member id → name, for "suggéré par X" on a kid-suggested supper.
  const memberName = (id: string | null | undefined) =>
    (id && boardQ.data?.members?.find((m) => m.id === id)?.display_name) || ''
  const recipes = recipesQ.data?.recipes ?? []
  // The recipe book is routes now (/kitchen/recipe/:id, …/edit, …/cook, …/new) —
  // openers navigate instead of toggling local overlay state.
  // Which slot's recipe picker is open ({date, slot}) — any slot can pick a
  // recipe now, not just the souper.
  const [recipePickFor, setRecipePickFor] = useState<{ date: number; slot: string } | null>(null)
  const pickOpenFor = (date: number, slot: string) => recipePickFor?.date === date && recipePickFor.slot === slot
  // Quick-add is the default (tap a recipe → it's set, no staples). This toggle
  // opts a pick INTO the grocery flow ("ajouter les ingrédients aussi") for the
  // times you do want the staples chips — kept off so dropping a recipe is one tap.
  const [pickWithStaples, setPickWithStaples] = useState(false)
  // Parent kitchen sub-tab: one job at a time so the page isn't an endless scroll.
  // Held in the URL (?tab=) so it survives the return from a full-screen add/edit
  // scene — add a recipe from Recettes and you come back to Recettes. See tabParam.
  const [kitTab, setKitTab] = useTabParam('tab', 'meals', ['meals', 'pantry', 'recipes'] as const)
  // Match a planned supper to a saved recipe by (loose) title, so a day's meal can
  // open its recipe.
  const recipeByTitle = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.title.trim().toLowerCase(), r)
    return m
  }, [recipes])
  // Exact link: a planned meal's recipe_id → its recipe. Preferred over the loose
  // title match (survives renames/duplicates); title stays the fallback for plain
  // free-text meals and pre-link rows.
  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.id, r)
    return m
  }, [recipes])
  // The recipe a planned meal points at: its exact link first, else a title match.
  const recipeForMeal = (meal: MealRow): Recipe | undefined =>
    (meal.recipe_id ? recipeById.get(meal.recipe_id) : undefined) ??
    recipeByTitle.get(meal.title.trim().toLowerCase())
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
    const date = weekStart + i * 86400
    const meal = days.find((d) => d.date === date && d.slot === 'supper')
    return { date, meal }
  })
  // date+slot → its planned meals, in order (a slot holds several now). Server
  // already orders by position; this just filters the flat list.
  const mealsFor = (date: number, slot: string) => days.filter((d) => d.date === date && d.slot === slot)
  // date → its day note (the per-day memo), if any.
  const noteFor = (date: number) => dayNotesQ.data?.notes?.find((n) => n.date === date)

  // The flows (see components/kitchen/use*). Destructured to the same names the
  // JSX always used, so the markup below reads unchanged.
  const ai = useAiWake()
  const { aiWaking } = ai
  const {
    editDate,
    setEditDate,
    mealText,
    setMealText,
    staplesBusy,
    staplePrompt,
    mealErr,
    saveMeal,
    beginSetMeal,
    chooseRecipeForMeal,
    kidSuggest,
    toggleStaple,
  } = useMealPlanning(ai, profileId)
  const { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, confirmShop, shoppableCount } =
    useRecipeShop(days, recipeForMeal, listItems)
  const suggest = useMealSuggest(recipes, ai, lowItems, listItems)

  // The week's three actions (shop the week / AI ideas / ideas from the book) now
  // live inside the ＋ Add sheet, not as a floating rail. The sheet is rendered by
  // HubLayout (a sibling of this page), so register the live handlers + their
  // availability up to it. Only while the Repas tab is the parent view — that's
  // where each action's result (the shop chips / the suggestion card) appears.
  const { register: registerKitchen } = useKitchenActions()
  const kitchenActionsActive = kitTab === 'meals' && audience === 'parent'
  useEffect(() => {
    if (!kitchenActionsActive) {
      registerKitchen(null, { active: false, canShop: false, canAiSuggest: false, aiBusy: false, hasRecipes: false })
      return
    }
    registerKitchen(
      { shop: beginShopWeek, ai: suggest.suggestAi, book: suggest.suggestFromRecipes },
      {
        active: true,
        canShop: shoppableCount > 0,
        canAiSuggest: !suggest.aiOff,
        aiBusy: suggest.aiBusy,
        hasRecipes: suggest.hasRecipes,
      },
    )
    return () =>
      registerKitchen(null, { active: false, canShop: false, canAiSuggest: false, aiBusy: false, hasRecipes: false })
  }, [
    kitchenActionsActive,
    shoppableCount,
    suggest.aiOff,
    suggest.aiBusy,
    suggest.hasRecipes,
    beginShopWeek,
    suggest.suggestAi,
    suggest.suggestFromRecipes,
    registerKitchen,
  ])

  // Plan a recipe onto ANY slot (the shared picker's onPick). Souper keeps its
  // optional "+ ingredients" staples step; every other slot is a clean quick-add
  // (links the recipe, saves now). Closes whichever editor was open.
  async function planRecipe(date: number, slot: string, r: Recipe) {
    setRecipePickFor(null)
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    if (slot === 'supper' && pickWithStaples) {
      chooseRecipeForMeal(date, slot, r)
      return
    }
    await api('meals', { method: 'POST', body: { date, slot, title: r.title, recipeId: r.id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Keep a suggestion (AI text, or a real recipe link) into the ideas pool.
  async function keepSuggestion() {
    if (!suggest.current) return
    await api('meal-ideas', {
      method: 'POST',
      body: { title: suggest.current.title, recipeId: suggest.current.recipe?.id ?? null, suggestedBy: profileId },
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
              above) — no more floating rail. Their results still surface here. */}
          {aiWaking && (
            <p className="kitchen__ai-waking mono" role="status">
              ⏳ {t.kitchen.aiWaking}
            </p>
          )}
          {mealErr && (
            <p className="error mono" role="alert">
              {t.common.saveFailed}
            </p>
          )}
          {suggest.current && (
            <div className="kitchen__suggestion" role="status">
              <span className="kitchen__suggestion-text">
                🍽 {suggest.current.title}
                {suggest.current.source === 'book' && (suggest.current.missing ?? 0) > 0 && (
                  <span className="mono kitchen__suggestion-sub"> · {t.recipes.missingN(suggest.current.missing!)}</span>
                )}
              </span>
              <span className="kitchen__suggestion-actions">
                {suggest.current.recipe && (
                  <button
                    type="button"
                    className="btn btn--ghost mono"
                    onClick={() => nav(`/kitchen/recipe/${suggest.current!.recipe!.id}`)}
                  >
                    {t.kitchen.suggestOpen}
                  </button>
                )}
                <button type="button" className="btn btn--ghost mono" onClick={keepSuggestion}>
                  ＋ {t.kitchen.suggestKeep}
                </button>
              </span>
            </div>
          )}
          {shopPrompt && (
            <div className="kitchen__staples kitchen__shop">
              {shopPrompt.length === 0 ? (
                <p className="kitchen__staples-q mono">{t.kitchen.shopWeekEmpty}</p>
              ) : (
                <>
                  <p className="kitchen__staples-q mono">{t.kitchen.shopWeekQ}</p>
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
                  <button type="button" className="btn btn--primary mono" onClick={confirmShop} disabled={shopBusy}>
                    {t.kitchen.shopWeekAdd}
                  </button>
                )}
                <button type="button" className="btn btn--ghost mono" onClick={() => setShopPrompt(null)}>
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}
          <ul className="kitchen__week">
            {week.map(({ date, meal }) => {
              const dow = new Date(date * 1000).getDay()
              const isToday = date === weekStart
              const isTomorrow = date === weekStart + 86400
              const rel = isToday ? t.board.today : isTomorrow ? t.board.tomorrow : null
              const suppers = mealsFor(date, 'supper') // a day can hold several
              const dayMealCount = days.filter((d) => d.date === date).length
              return (
              <li
                key={date}
                className={
                  'surface kitchen__day' +
                  (isToday ? ' is-today' : '') +
                  (dow === 0 || dow === 6 ? ' is-weekend' : '')
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
                {/* The day's own meal picture (pizza/soup/fish) when planned, a quiet
                    "+" when the slot is open — never seven identical carrots. */}
                <span className="kitchen__day-tile" aria-hidden="true">
                  {meal ? (
                    <span className="kitchen__day-picto">{pictoFor(meal.title, '🍽')}</span>
                  ) : (
                    <span className="kitchen__day-add">＋</span>
                  )}
                </span>
                <div className="kitchen__day-body">
                {staplePrompt?.date === date ? (
                  <div className="kitchen__staples">
                    <p className="kitchen__staples-q mono">
                      {staplePrompt.title} · {t.kitchen.staplesQ}
                    </p>
                    <p className="kitchen__staples-hint mono">{t.kitchen.staplesHint}</p>
                    <div className="kitchen__staples-chips">
                      {staplePrompt.options.map((o) => (
                        <button
                          key={o.item}
                          type="button"
                          className={`chip${o.on ? ' is-on' : ''}`}
                          onClick={() => toggleStaple(o.item)}
                          aria-pressed={o.on}
                          title={o.item}
                        >
                          <InlineIcon name={o.on ? 'check-square-bold' : 'square-bold'} /> {o.item}
                        </button>
                      ))}
                    </div>
                    <div className="kitchen__staples-actions">
                      <button
                        type="button"
                        className="btn btn--primary mono"
                        onClick={() =>
                          saveMeal(
                            staplePrompt.date,
                            staplePrompt.slot,
                            staplePrompt.title,
                            staplePrompt.options.filter((o) => o.on).map((o) => o.item),
                            staplePrompt.recipeId,
                          )
                        }
                      >
                        {t.kitchen.staplesAdd}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost mono"
                        onClick={() => saveMeal(staplePrompt.date, staplePrompt.slot, staplePrompt.title, [], staplePrompt.recipeId)}
                      >
                        {t.kitchen.staplesSkip}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <MealRows
                      meals={suppers}
                      recipeFor={recipeForMeal}
                      memberName={memberName}
                      onOpenRecipe={(r) => nav(`/kitchen/recipe/${r.id}`)}
                      onRemove={clearMeal}
                      onMove={moveMeal}
                      onClearAll={() => clearSlotMeals(date, 'supper')}
                    />
                    {editDate === date ? (
                  <div className="kitchen__day-edit-wrap">
                    <form
                      className="kitchen__day-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        beginSetMeal(date, 'supper')
                      }}
                    >
                      <input
                        className="input"
                        autoFocus
                        value={mealText}
                        onChange={(e) => setMealText(e.target.value)}
                        placeholder={t.kitchen.plan}
                      />
                      {mealText && (
                        <button
                          type="button"
                          className="btn btn--ghost mono kitchen__clear-text"
                          onClick={() => setMealText('')}
                          aria-label={t.kitchen.clearText}
                          title={t.kitchen.clearText}
                        >
                          <Icon name="x-bold" size={15} />
                        </button>
                      )}
                      <button type="submit" className="btn btn--ghost mono" disabled={staplesBusy}>
                        {staplesBusy ? t.kitchen.staplesThinking : t.kitchen.setMeal}
                      </button>
                    </form>
                    {recipes.length > 0 && (
                      <div className="kitchen__day-recipes">
                        <div className="kitchen__day-recipes-row">
                          <button
                            type="button"
                            className="btn btn--ghost mono kitchen__pick-recipe"
                            onClick={() =>
                              setRecipePickFor(pickOpenFor(date, 'supper') ? null : { date, slot: 'supper' })
                            }
                            aria-expanded={pickOpenFor(date, 'supper')}
                          >
                            <InlineIcon name="book-open-bold" /> {t.kitchen.chooseRecipe}
                          </button>
                        </div>
                        {pickOpenFor(date, 'supper') && (
                          <>
                            {/* Pick a recipe → quick-add (links it, saves now, no
                                staples). Flip this on first to also confirm its
                                ingredients for the grocery list. */}
                            <button
                              type="button"
                              className={'chip kitchen__recipe-staples' + (pickWithStaples ? ' is-on' : '')}
                              onClick={() => setPickWithStaples((s) => !s)}
                              aria-pressed={pickWithStaples}
                            >
                              <InlineIcon name={pickWithStaples ? 'check-square-bold' : 'square-bold'} /> 🛒 {t.kitchen.alsoStaples}
                            </button>
                            <RecipePickerMenu
                              recipes={recipes}
                              lowItems={lowItems}
                              listItems={listItems}
                              onPick={(r) => planRecipe(date, 'supper', r)}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                    ) : (
                      <button
                        type="button"
                        className="kitchen__day-meal"
                        onClick={() => {
                          setEditDate(date)
                          setMealText('')
                        }}
                      >
                        {suppers.length ? (
                          <span className="kitchen__day-add-more mono">＋ {t.kitchen.addAnother}</span>
                        ) : (
                          <span className="kitchen__day-empty mono">{t.kitchen.planShort}</span>
                        )}
                      </button>
                    )}
                  </>
                )}

                {/* The lighter slots beside the souper — déjeuner / dîner /
                    collation. Each shows its planned title (or picture + label);
                    tapping opens an inline editor with the SAME recipe picker as
                    the souper, so any meal can link a recipe — just without the
                    souper's grocery-staples step. */}
                <div className="kitchen__slots">
                  {SIDE_SLOTS.map((slot) => {
                    const slotMeals = mealsFor(date, slot)
                    const editing = editSlot?.date === date && editSlot.slot === slot
                    return (
                      <div key={slot} className="kitchen__slot-wrap">
                        <div className="kitchen__slot-head">
                          <Icon name={SLOT_ICON_NAME[slot]} size={16} color="var(--ink-soft)" />
                          <span className="kitchen__slot-label">{t.kitchen.slots[slot]}</span>
                        </div>
                        <MealRows
                          meals={slotMeals}
                          recipeFor={recipeForMeal}
                          memberName={memberName}
                          onOpenRecipe={(r) => nav(`/kitchen/recipe/${r.id}`)}
                          onRemove={clearMeal}
                          onMove={moveMeal}
                          onClearAll={() => clearSlotMeals(date, slot)}
                        />
                        {editing ? (
                          <div className="kitchen__slot-edit-wrap">
                            <form
                              className="kitchen__slot-edit"
                              onSubmit={(e) => {
                                e.preventDefault()
                                saveSlot(date, slot, slotText)
                              }}
                            >
                              <input
                                className="input"
                                autoFocus
                                value={slotText}
                                onChange={(e) => setSlotText(e.target.value)}
                                placeholder={t.kitchen.slots[slot]}
                                aria-label={t.kitchen.slots[slot]}
                              />
                              {slotText && (
                                <button
                                  type="button"
                                  className="btn btn--ghost mono kitchen__clear-text"
                                  onClick={() => setSlotText('')}
                                  aria-label={t.kitchen.clearText}
                                  title={t.kitchen.clearText}
                                >
                                  <Icon name="x-bold" size={15} />
                                </button>
                              )}
                              <button type="submit" className="btn btn--ghost mono">
                                {t.kitchen.setMeal}
                              </button>
                            </form>
                            {recipes.length > 0 && (
                              <div className="kitchen__day-recipes">
                                <div className="kitchen__day-recipes-row">
                                  <button
                                    type="button"
                                    className="btn btn--ghost mono kitchen__pick-recipe"
                                    onClick={() => setRecipePickFor(pickOpenFor(date, slot) ? null : { date, slot })}
                                    aria-expanded={pickOpenFor(date, slot)}
                                  >
                                    <InlineIcon name="book-open-bold" /> {t.kitchen.chooseRecipe}
                                  </button>
                                </div>
                                {pickOpenFor(date, slot) && (
                                  <RecipePickerMenu
                                    recipes={recipes}
                                    lowItems={lowItems}
                                    listItems={listItems}
                                    onPick={(r) => planRecipe(date, slot, r)}
                                  />
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              className="btn btn--ghost mono kitchen__add-cancel"
                              onClick={() => {
                                setEditSlot(null)
                                setSlotText('')
                              }}
                            >
                              {t.common.cancel}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="kitchen__slot-add mono"
                            onClick={() => {
                              setEditSlot({ date, slot })
                              setSlotText('')
                            }}
                          >
                            ＋ {slotMeals.length ? t.kitchen.addAnother : t.kitchen.slots[slot]}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Easy clearing: wipe the whole day's meals at once. Only when
                    there's something to clear, so an empty day stays calm. */}
                {dayMealCount > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost mono kitchen__clear-day"
                    onClick={() => clearDay(date)}
                  >
                    <InlineIcon name="trash-bold" /> {t.kitchen.clearDay}
                  </button>
                )}

                {/* The day's note — a free-text memo that isn't a meal (a pickup,
                    an outing, "souper léger"). One per day; it rides under the
                    slots here and surfaces on the Aujourd'hui board for today. */}
                {(() => {
                  const note = noteFor(date)
                  return (
                    <div className="kitchen__note">
                      {editNote === date ? (
                        <form
                          className="kitchen__note-edit"
                          onSubmit={(e) => {
                            e.preventDefault()
                            saveNote(date, noteText)
                          }}
                        >
                          <input
                            className="input"
                            autoFocus
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder={t.kitchen.notePlaceholder}
                            aria-label={t.kitchen.note}
                          />
                          <button type="submit" className="btn btn--ghost mono">
                            {t.kitchen.setMeal}
                          </button>
                          {note && (
                            <button
                              type="button"
                              className="btn btn--ghost mono kitchen__clear-meal"
                              onClick={() => clearNote(date)}
                            >
                              <InlineIcon name="trash-bold" /> {t.kitchen.clearNote}
                            </button>
                          )}
                        </form>
                      ) : note ? (
                        <button
                          type="button"
                          className="kitchen__note-chip"
                          onClick={() => {
                            setEditNote(date)
                            setNoteText(note.text)
                          }}
                        >
                          <span aria-hidden="true"><Icon name="pencil-simple-bold" size={16} /></span>
                          <span className="kitchen__note-text">{note.text}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="kitchen__note-add mono"
                          onClick={() => {
                            setEditNote(date)
                            setNoteText('')
                          }}
                        >
                          ＋ {t.kitchen.note}
                        </button>
                      )}
                    </div>
                  )
                })()}
                </div>
              </li>
              )
            })}
          </ul>

          <MealIdeas
            ideas={ideasQ.data?.ideas ?? []}
            recipes={recipes}
            week={week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) }))}
            lowItems={lowItems}
            listItems={listItems}
            profileId={profileId}
          />
        </section>
        )}

        {kitTab === 'pantry' && <PantryTab low={low} soon={soon} />}

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
