import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useProfile } from '../lib/profile'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday } from '../lib/format'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { pictoFor } from '../lib/picto'
import { RecipeSheet } from '../components/RecipeSheet'
import { CookMode } from '../components/CookMode'
import { RecipeForm } from '../components/RecipeForm'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { PantryTab } from '../components/kitchen/PantryTab'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeShop } from '../components/kitchen/useRecipeShop'
import { useMealSuggest } from '../components/kitchen/useMealSuggest'
import { type LowRow, type MealRow, type MealsData, type MealIdeasData, type PantryData, type WeekDay, MEALS_KEY, MEAL_IDEAS_KEY, PANTRY_KEY, USE_SOON_KEY } from '../components/kitchen/types'
import { MealIdeas } from '../components/kitchen/MealIdeas'
import { RecipePickerMenu } from '../components/kitchen/RecipePickerMenu'
import { SIDE_SLOTS, SLOT_ICON } from '../lib/mealSlots'

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

  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })
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
  // Recipe book overlays: a recipe being viewed, and one being created/edited
  // ('new' = a blank form). recipePickFor = the day a recipe is being chosen for.
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null)
  const [editRecipe, setEditRecipe] = useState<Recipe | 'new' | null>(null)
  // Which slot's recipe picker is open ({date, slot}) — any slot can pick a
  // recipe now, not just the souper.
  const [recipePickFor, setRecipePickFor] = useState<{ date: number; slot: string } | null>(null)
  const pickOpenFor = (date: number, slot: string) => recipePickFor?.date === date && recipePickFor.slot === slot
  // Quick-add is the default (tap a recipe → it's set, no staples). This toggle
  // opts a pick INTO the grocery flow ("ajouter les ingrédients aussi") for the
  // times you do want the staples chips — kept off so dropping a recipe is one tap.
  const [pickWithStaples, setPickWithStaples] = useState(false)
  // A toddler tapped a planned meal to cook it → full-screen read-aloud Cook mode.
  const [kidCook, setKidCook] = useState<Recipe | null>(null)
  // Parent kitchen sub-tab: one job at a time so the page isn't an endless scroll.
  const [kitTab, setKitTab] = useState<'meals' | 'pantry' | 'recipes'>('meals')
  // ?add=recipe — the contextual ＋ sheet's "Ajouter une recette" tile lands
  // here (the recipe builder is a full overlay owned by this page, not by the
  // sheet). Consume the param once, then strip it so refresh/back don't reopen
  // a blank form.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('add') !== 'recipe') return
    setKitTab('recipes')
    setEditRecipe('new')
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])
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
  const low = pantry.data?.low ?? []
  const soon = useSoonQ.data?.soon ?? []

  // Build the 7-day grid from weekStart. The SOUPER is the day's primary meal
  // (the headline, the shop-the-week driver, the kid-suggestion target), so the
  // grid + week shape stay keyed on it; the other slots ride alongside.
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = weekStart + i * 86400
    const meal = days.find((d) => d.date === date && d.slot === 'supper')
    return { date, meal }
  })
  // date → (slot → meal) for the breakfast/lunch/snack chips under each day.
  const slotMeal = (date: number, slot: string) => days.find((d) => d.date === date && d.slot === slot)

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
    useRecipeShop(week, recipeForMeal, listItems)
  const suggest = useMealSuggest(recipes, ai, lowItems, listItems)

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
      chooseRecipeForMeal(date, r)
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
      <>
        <KidKitchen
          week={week}
          recipes={recipes}
          recipeFor={recipeForMeal}
          onSuggest={kidSuggest}
          onStartRecipe={setKidCook}
        />
        {/* "Start its recipe": a planned meal a toddler taps opens Cook mode —
            big one-step-at-a-time pages that read themselves aloud. */}
        {kidCook && <CookMode recipe={kidCook} onClose={() => setKidCook(null)} />}
      </>
    )
  }

  return (
    <>
      <main className="kitchen today-feed">
        <div className="app-head">
          <div>
            <div className="hand-tag">{t.kitchen.plan}</div>
            <h1 className="greet">{t.kitchen.title}</h1>
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
            <div className="kitchen__head-actions">
              {shoppableCount > 0 && (
                <button type="button" className="btn" onClick={beginShopWeek} disabled={shopBusy}>
                  🛒 {t.kitchen.shopWeek}
                </button>
              )}
              {/* Two separate idea sources — fresh from the AI, or from your own
                  recipes ranked by what's in stock. Never blended. */}
              <button
                type="button"
                className="btn"
                onClick={suggest.suggestAi}
                disabled={suggest.aiBusy || suggest.aiOff}
                title={suggest.aiOff ? t.kitchen.suggestAiOff : undefined}
              >
                {suggest.aiBusy ? t.kitchen.suggestThinking : t.kitchen.suggestAi}
              </button>
              {suggest.hasRecipes && (
                <button type="button" className="btn" onClick={suggest.suggestFromRecipes}>
                  {t.kitchen.suggestFromRecipes}
                </button>
              )}
            </div>
          </div>
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
                    onClick={() => setViewRecipe(suggest.current!.recipe!)}
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
                        {o.on ? '☑' : '☐'} {o.item}
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
            {week.map(({ date, meal }) => (
              <li key={date} className="surface kitchen__day">
                {/* The day's own meal picture (pizza/soup/fish) when planned, a quiet
                    "+" when the slot is open — never seven identical carrots. */}
                <span className="kitchen__day-tile" aria-hidden="true">
                  {meal ? (
                    <span className="kitchen__day-picto">{pictoFor(meal.title, '🍽')}</span>
                  ) : (
                    <span className="kitchen__day-add">＋</span>
                  )}
                </span>
                <span className="kitchen__day-name mono">{formatWeekday(date, lang)}</span>
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
                          {o.on ? '☑' : '☐'} {o.item}
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
                        onClick={() => saveMeal(staplePrompt.date, staplePrompt.title, [], staplePrompt.recipeId)}
                      >
                        {t.kitchen.staplesSkip}
                      </button>
                    </div>
                  </div>
                ) : editDate === date ? (
                  <div className="kitchen__day-edit-wrap">
                    <form
                      className="kitchen__day-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        beginSetMeal(date)
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
                          ✕
                        </button>
                      )}
                      <button type="submit" className="btn btn--ghost mono" disabled={staplesBusy}>
                        {staplesBusy ? t.kitchen.staplesThinking : t.kitchen.setMeal}
                      </button>
                    </form>
                    {(recipes.length > 0 || meal) && (
                      <div className="kitchen__day-recipes">
                        <div className="kitchen__day-recipes-row">
                          {recipes.length > 0 && (
                            <button
                              type="button"
                              className="btn btn--ghost mono kitchen__pick-recipe"
                              onClick={() =>
                                setRecipePickFor(pickOpenFor(date, 'supper') ? null : { date, slot: 'supper' })
                              }
                              aria-expanded={pickOpenFor(date, 'supper')}
                            >
                              📖 {t.kitchen.chooseRecipe}
                            </button>
                          )}
                          {meal && (
                            <button
                              type="button"
                              className="btn btn--ghost mono kitchen__clear-meal"
                              onClick={() => clearMeal(meal.id)}
                            >
                              🗑 {t.kitchen.clearMeal}
                            </button>
                          )}
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
                              {pickWithStaples ? '☑' : '☐'} 🛒 {t.kitchen.alsoStaples}
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
                  <>
                    <button
                      type="button"
                      className="kitchen__day-meal"
                      onClick={() => {
                        setEditDate(date)
                        setMealText(meal?.title ?? '')
                      }}
                    >
                      {meal?.title ?? <span className="kitchen__day-empty mono">{t.kitchen.planShort}</span>}
                    </button>
                    {meal && recipeForMeal(meal) && (
                      <button
                        type="button"
                        className="kitchen__day-recipe-link"
                        onClick={() => setViewRecipe(recipeForMeal(meal)!)}
                        aria-label={t.recipes.title}
                        title={t.recipes.title}
                      >
                        📖
                      </button>
                    )}
                    {/* A kid suggested this supper into an empty slot — a parent sees
                        whose idea it was, and can keep it or tap to change it. */}
                    {meal?.suggested_by != null && (
                      <span className="kitchen__day-sugg mono">
                        💡 {memberName(meal.suggested_by) || t.kitchen.suggested}
                      </span>
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
                    const sm = slotMeal(date, slot)
                    const editing = editSlot?.date === date && editSlot.slot === slot
                    const linked = sm ? recipeForMeal(sm) : undefined
                    return editing ? (
                      <div key={slot} className="kitchen__slot-edit-wrap">
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
                              ✕
                            </button>
                          )}
                          <button type="submit" className="btn btn--ghost mono">
                            {t.kitchen.setMeal}
                          </button>
                        </form>
                        {(recipes.length > 0 || sm) && (
                          <div className="kitchen__day-recipes">
                            <div className="kitchen__day-recipes-row">
                              {recipes.length > 0 && (
                                <button
                                  type="button"
                                  className="btn btn--ghost mono kitchen__pick-recipe"
                                  onClick={() => setRecipePickFor(pickOpenFor(date, slot) ? null : { date, slot })}
                                  aria-expanded={pickOpenFor(date, slot)}
                                >
                                  📖 {t.kitchen.chooseRecipe}
                                </button>
                              )}
                              {sm && (
                                <button
                                  type="button"
                                  className="btn btn--ghost mono kitchen__clear-meal"
                                  onClick={() => clearMeal(sm.id)}
                                >
                                  🗑 {t.kitchen.clearMeal}
                                </button>
                              )}
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
                      </div>
                    ) : (
                      <span key={slot} className="kitchen__slot-wrap">
                        <button
                          type="button"
                          className={'kitchen__slot' + (sm ? ' is-set' : '')}
                          onClick={() => {
                            setEditSlot({ date, slot })
                            setSlotText(sm?.title ?? '')
                          }}
                          title={t.kitchen.slots[slot]}
                        >
                          <span aria-hidden="true">{SLOT_ICON[slot]}</span>
                          <span className="kitchen__slot-label">{sm?.title ?? t.kitchen.slots[slot]}</span>
                        </button>
                        {linked && (
                          <button
                            type="button"
                            className="kitchen__slot-recipe-link"
                            onClick={() => setViewRecipe(linked)}
                            aria-label={t.recipes.title}
                            title={t.recipes.title}
                          >
                            📖
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              </li>
            ))}
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
            onView={setViewRecipe}
          />
        )}
      </main>

      {viewRecipe && (
        <RecipeSheet
          recipe={viewRecipe}
          week={week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) }))}
          onEdit={() => {
            setEditRecipe(viewRecipe)
            setViewRecipe(null)
          }}
          onClose={() => setViewRecipe(null)}
        />
      )}
      {editRecipe && (
        <RecipeForm
          value={editRecipe === 'new' ? null : editRecipe}
          onSaved={() => setEditRecipe(null)}
          onCancel={() => setEditRecipe(null)}
        />
      )}
    </>
  )
}
