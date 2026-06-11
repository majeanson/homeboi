import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { type LowRow, type MealsData, type PantryData, type WeekDay, MEALS_KEY, PANTRY_KEY, USE_SOON_KEY } from '../components/kitchen/types'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The page owns the queries (one unauth
// gate for all), the week grid, and the layout; the FLOWS live as hooks beside
// the tab components in src/components/kitchen/* (useMealPlanning = type/pick a
// supper + the AI staples step, useRecipeShop = shop-the-week, useMealSuggest =
// supper ideas, useAiWake = the shared cold-start/AI-off truth).
export function Kitchen() {
  const t = useT()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { memberId: profileId } = useProfile()

  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })
  const pantry = useQuery({ queryKey: PANTRY_KEY, queryFn: () => api<PantryData>('pantry'), ...live })
  const useSoonQ = useQuery({ queryKey: USE_SOON_KEY, queryFn: () => api<{ soon: LowRow[] }>('use-soon'), ...live })
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })
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
  const [recipePickFor, setRecipePickFor] = useState<number | null>(null)
  // A toddler tapped a planned meal to cook it → full-screen read-aloud Cook mode.
  const [kidCook, setKidCook] = useState<Recipe | null>(null)
  // Parent kitchen sub-tab: one job at a time so the page isn't an endless scroll.
  const [kitTab, setKitTab] = useState<'meals' | 'pantry' | 'recipes'>('meals')
  // Match a planned supper to a saved recipe by (loose) title, so a day's meal can
  // open its recipe.
  const recipeByTitle = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.title.trim().toLowerCase(), r)
    return m
  }, [recipes])
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const soonItems = useMemo(() => (useSoonQ.data?.soon ?? []).map((s) => s.item), [useSoonQ.data])
  const unauth = isUnauthorized(meals.error) || isUnauthorized(pantry.error)
  const days = meals.data?.days ?? []
  const weekStart = meals.data?.weekStart ?? 0
  const low = pantry.data?.low ?? []
  const soon = useSoonQ.data?.soon ?? []

  // Build the 7-day grid from weekStart, slotting in any planned meal.
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = weekStart + i * 86400
    const meal = days.find((d) => d.date === date)
    return { date, meal }
  })

  // The flows (see components/kitchen/use*). Destructured to the same names the
  // JSX always used, so the markup below reads unchanged.
  const ai = useAiWake()
  const { aiWaking, aiUnavailable } = ai
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
    useRecipeShop(week, recipeByTitle, listItems)
  const { suggestion, suggesting, suggest } = useMealSuggest(recipes, ai)

  if (unauth) return <PairPrompt />

  if (audience === 'toddler') {
    return (
      <>
        <KidKitchen
          week={week}
          recipes={recipes}
          recipeByTitle={recipeByTitle}
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
              {(!aiUnavailable || recipes.length > 0) && (
                <button type="button" className="btn" onClick={suggest} disabled={suggesting}>
                  {suggesting ? t.kitchen.suggestThinking : suggestion ? t.kitchen.suggestAnother : t.kitchen.suggest}
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
          {suggestion && (
            <p className="kitchen__suggestion" role="status">
              🍽 {suggestion}
            </p>
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
                          )
                        }
                      >
                        {t.kitchen.staplesAdd}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost mono"
                        onClick={() => saveMeal(staplePrompt.date, staplePrompt.title, [])}
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
                      <button type="submit" className="btn btn--ghost mono" disabled={staplesBusy}>
                        {staplesBusy ? t.kitchen.staplesThinking : t.kitchen.setMeal}
                      </button>
                    </form>
                    {recipes.length > 0 && (
                      <div className="kitchen__day-recipes">
                        <button
                          type="button"
                          className="btn btn--ghost mono kitchen__pick-recipe"
                          onClick={() => setRecipePickFor(recipePickFor === date ? null : date)}
                          aria-expanded={recipePickFor === date}
                        >
                          📖 {t.kitchen.pickRecipe}
                        </button>
                        {recipePickFor === date && (
                          <div className="kitchen__recipe-menu">
                            {recipes.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                className="chip"
                                onClick={() => {
                                  // The picker menu is page chrome, not flow state —
                                  // close it here; the hook closes the day editor.
                                  setRecipePickFor(null)
                                  chooseRecipeForMeal(date, r)
                                }}
                              >
                                {r.title}
                              </button>
                            ))}
                          </div>
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
                    {meal && recipeByTitle.get(meal.title.trim().toLowerCase()) && (
                      <button
                        type="button"
                        className="kitchen__day-recipe-link"
                        onClick={() => setViewRecipe(recipeByTitle.get(meal.title.trim().toLowerCase())!)}
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
              </li>
            ))}
          </ul>
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
            onNew={() => setEditRecipe('new')}
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
