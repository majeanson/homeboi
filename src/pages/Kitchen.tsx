import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useProfile } from '../lib/profile'
import { api, isStatus, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday } from '../lib/format'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { normKey } from '../lib/cookable'
import { ingredientName } from '../lib/ingredient'
import { pictoFor } from '../lib/picto'
import { RecipeSheet } from '../components/RecipeSheet'
import { RecipeForm } from '../components/RecipeForm'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { PantryTab } from '../components/kitchen/PantryTab'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { type LowRow, type MealsData, type PantryData, MEALS_KEY, PANTRY_KEY, USE_SOON_KEY } from '../components/kitchen/types'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The pantry and recipe tabs and the
// toddler lens live in src/components/kitchen/*; this page owns the queries
// (one unauth gate for all), the week grid, and the meal-planning flows (the
// AI staples step, shop-the-week, the kid-suggestion write).
export function Kitchen() {
  const t = useT()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { memberId: profileId } = useProfile()
  const qc = useQueryClient()
  // A batch of supper ideas + a cursor into it: each click shows the next without
  // re-asking, until the batch (10) is used up — then a click fetches a new one.
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestIdx, setSuggestIdx] = useState(0)
  const [suggesting, setSuggesting] = useState(false)
  const [aiUnavailable, setAiUnavailable] = useState(false)
  // Workers AI cold-starts the first call of a session (model load) — it can take
  // 10-30s. After a short wait we surface a "the model's waking up" line so that
  // first slow call reads as warming, not frozen. Warm calls finish before it shows.
  const [aiWaking, setAiWaking] = useState(false)
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function aiStart() {
    if (wakeTimer.current) clearTimeout(wakeTimer.current)
    wakeTimer.current = setTimeout(() => setAiWaking(true), 3500)
  }
  function aiDone() {
    if (wakeTimer.current) clearTimeout(wakeTimer.current)
    setAiWaking(false)
  }
  const [editDate, setEditDate] = useState<number | null>(null)
  const [mealText, setMealText] = useState('')
  // The meal -> grocery staple step (B3): after a title is entered, we offer the
  // dish's staples as pre-checked chips for the shared list. null = no prompt up.
  const [staplesBusy, setStaplesBusy] = useState(false)
  const [staplePrompt, setStaplePrompt] = useState<{
    date: number
    title: string
    options: { item: string; on: boolean }[]
  } | null>(null)
  // "Shop this week": gather the ingredients of recipes matching the week's
  // planned meals (minus what's already on the list) into a confirm panel.
  const [shopPrompt, setShopPrompt] = useState<{ item: string; on: boolean }[] | null>(null)
  const [shopBusy, setShopBusy] = useState(false)

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
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = weekStart + i * 86400
    const meal = days.find((d) => d.date === date)
    return { date, meal }
  })

  // Persist the supper, optionally pushing chosen staples onto the shared list
  // (the meals endpoint inserts them with source 'meal' in the same write).
  // On failure the edit/staple state stays put (the typed title isn't lost) and
  // an error line appears — silently closing would read as "saved" when nothing was.
  const [mealErr, setMealErr] = useState(false)
  async function saveMeal(date: number, title: string, staples: string[]) {
    setMealErr(false)
    try {
      await api('meals', { method: 'POST', body: { date, title, staples } })
      setEditDate(null)
      setMealText('')
      setStaplePrompt(null)
    } catch {
      setMealErr(true)
    } finally {
      qc.invalidateQueries({ queryKey: MEALS_KEY })
    }
  }

  // Setting a meal first asks the router for its staples (B3). If AI finds some,
  // we show the confirm chips; if AI is off (503) or finds nothing, we just save
  // the meal — the staple step is a bonus, never a gate (NFR-DEGRADE-1).
  async function beginSetMeal(date: number) {
    const title = mealText.trim()
    if (!title) return
    setStaplesBusy(true)
    aiStart()
    try {
      const res = await api<{ staples: string[] }>('meal-staples', { method: 'POST', body: { title } })
      if (res.staples.length) {
        // Start unchecked: the user ticks what they're MISSING (need to buy),
        // rather than un-ticking everything they already have.
        setStaplePrompt({ date, title, options: res.staples.map((item) => ({ item, on: false })) })
      } else {
        await saveMeal(date, title, [])
      }
    } catch (e) {
      if (isStatus(e, 503)) setAiUnavailable(true)
      await saveMeal(date, title, [])
    } finally {
      setStaplesBusy(false)
      aiDone()
    }
  }

  // Plan a day's supper FROM a saved recipe: its title fills the slot and its own
  // ingredients become the staple-confirm chips — so we skip the AI staples call
  // entirely (we already know them). The cook still ticks what they're missing.
  function chooseRecipeForMeal(date: number, recipe: Recipe) {
    setRecipePickFor(null)
    setEditDate(null)
    if (recipe.ingredients.length) {
      // Chips show buyable names ("Beurre non salé"), not measured recipe lines.
      const seen = new Set<string>()
      const options: { item: string; on: boolean }[] = []
      for (const ing of recipe.ingredients) {
        const item = ingredientName(ing)
        const k = item.toLowerCase()
        if (item && !seen.has(k)) {
          seen.add(k)
          options.push({ item, on: false })
        }
      }
      setStaplePrompt({ date, title: recipe.title, options })
    } else {
      saveMeal(date, recipe.title, [])
    }
  }

  // Toddler path: a child taps a recipe, then an empty day. This is a SUGGESTION,
  // not a decision — the server only fills an empty slot (unique-day index) and
  // records "suggested by" this device's child so a parent sees whose idea it was.
  async function kidSuggest(date: number, recipe: Recipe) {
    await api('meals', {
      method: 'POST',
      body: { date, title: recipe.title, suggest: true, suggestedBy: profileId },
    }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  function toggleStaple(item: string) {
    setStaplePrompt((p) =>
      p ? { ...p, options: p.options.map((o) => (o.item === item ? { ...o, on: !o.on } : o)) } : p,
    )
  }

  // Shop this week: walk the planned suppers, pull each matched recipe's
  // ingredients, drop anything already on the list (normalized), and open a
  // confirm panel (everything pre-checked — untick what you already have).
  function beginShopWeek() {
    const onList = new Set(listItems.map(normKey).filter(Boolean))
    const picked = new Set<string>()
    const items: string[] = []
    for (const { meal } of week) {
      if (!meal) continue
      const r = recipeByTitle.get(meal.title.trim().toLowerCase())
      if (!r) continue
      for (const ing of r.ingredients) {
        const k = normKey(ing)
        if (!k || onList.has(k) || picked.has(k)) continue
        picked.add(k)
        items.push(ingredientName(ing)) // buyable name, not the measured line
      }
    }
    setShopPrompt(items.map((item) => ({ item, on: true })))
  }

  function toggleShop(item: string) {
    setShopPrompt((p) => p?.map((o) => (o.item === item ? { ...o, on: !o.on } : o)) ?? p)
  }

  async function confirmShop() {
    const items = (shopPrompt ?? []).filter((o) => o.on).map((o) => o.item)
    if (!items.length) {
      setShopPrompt(null)
      return
    }
    setShopBusy(true)
    try {
      await api('recipe-to-list', { method: 'POST', body: { items } })
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['list'] })
    } catch {
      /* a failed add isn't worth an error wall — the list just won't grow */
    } finally {
      setShopBusy(false)
      setShopPrompt(null)
    }
  }

  // How many planned suppers map to a saved recipe — the shop button only shows
  // when there's something to gather (never a no-op).
  const shoppableCount = week.filter(
    (w) => w.meal && recipeByTitle.get(w.meal.title.trim().toLowerCase()),
  ).length

  const suggestion = suggestions[suggestIdx] ?? null

  // Cycle the family's own recipe titles as suggestions (the AI-off fallback, and
  // a way to resurface the book). Returns true if it had anything to show.
  function suggestFromBook(): boolean {
    if (!recipes.length) return false
    setSuggestions(recipes.map((r) => r.title))
    setSuggestIdx(0)
    return true
  }

  async function suggest() {
    // Still ideas left in the batch? Just advance — no new AI call.
    if (suggestions.length && suggestIdx < suggestions.length - 1) {
      setSuggestIdx((i) => i + 1)
      return
    }
    // AI already known off → just cycle the recipe book (or re-loop the batch).
    if (aiUnavailable) {
      if (!suggestFromBook()) setSuggestIdx(0)
      return
    }
    setSuggesting(true)
    aiStart()
    try {
      // Send the batch just seen so the model returns DIFFERENT dishes.
      const res = await api<{ suggestions: string[] }>('suggest-meal', {
        method: 'POST',
        body: { avoid: suggestions },
      })
      if (res.suggestions.length) {
        setSuggestions(res.suggestions)
        setSuggestIdx(0)
      } else if (!suggestFromBook()) {
        // Nothing new came back — re-loop the current batch so the button never
        // dead-ends after the tenth idea.
        setSuggestIdx(0)
      }
    } catch (e) {
      // No AI binding → fall back to the household's own recipes instead of hiding.
      if (isStatus(e, 503)) {
        setAiUnavailable(true)
        if (!suggestFromBook()) setSuggestIdx(0)
      } else {
        // Other hiccup → don't strand the user; re-loop what we have.
        setSuggestIdx(0)
      }
    } finally {
      setSuggesting(false)
      aiDone()
    }
  }

  if (unauth) return <PairPrompt />

  if (audience === 'toddler') {
    return <KidKitchen week={week} recipes={recipes} onSuggest={kidSuggest} />
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
                                onClick={() => chooseRecipeForMeal(date, r)}
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
