import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, type Tile } from '../components/BigTiles'
import { Icon } from '../components/Icon'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isStatus, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday } from '../lib/format'
import { type Recipe, RECIPES_KEY, recipeImg, allTags } from '../lib/recipes'
import { rankCookable, rankUseSoon, normKey } from '../lib/cookable'
import { ingredientName } from '../lib/ingredient'
import { pictoFor } from '../lib/picto'
import { useUndoToast } from '../lib/toast'
import { RecipeSheet } from '../components/RecipeSheet'
import { RecipeForm } from '../components/RecipeForm'

// Garde-manger. Weekly supper slots + a "running low" list (never a full
// inventory — brief tenet 3). One AI button asks for a supper suggestion; it
// hides itself when the AI binding is off (503).
interface MealRow { id: string; date: number; title: string; cook_member_id: string | null }
interface LowRow { id: string; item: string; marked_at: number }
type MealsData = { days: MealRow[]; weekStart: number }
type PantryData = { low: LowRow[] }
const MEALS_KEY = ['meals']
const PANTRY_KEY = ['pantry']
const USE_SOON_KEY = ['use-soon']

export function Kitchen() {
  const t = useT()
  const { lang } = useLang()
  const { audience } = useAudience()
  const qc = useQueryClient()
  const undo = useUndoToast()
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
  const [newLow, setNewLow] = useState('')
  const [newSoon, setNewSoon] = useState('')
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
  const boardQ = useQuery({ queryKey: ['board'], queryFn: () => api<{ list: { text: string }[] }>('board'), ...live })
  const recipes = recipesQ.data?.recipes ?? []
  // "Quoi cuisiner ?": when on, sort the grid by fewest out-of-stock ingredients.
  const [cookFilter, setCookFilter] = useState(false)
  // "À utiliser bientôt": when on, sort the grid by most use-soon items used.
  // Mutually exclusive with cookFilter (toggling one clears the other).
  const [useSoonFilter, setUseSoonFilter] = useState(false)
  // Recipe book overlays: a recipe being viewed, and one being created/edited
  // ('new' = a blank form). recipePickFor = the day a recipe is being chosen for.
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null)
  const [editRecipe, setEditRecipe] = useState<Recipe | 'new' | null>(null)
  const [recipePickFor, setRecipePickFor] = useState<number | null>(null)
  // Toddler meal-picking: the recipe a child has tapped and is now choosing a day
  // for (null = still browsing the recipe shelf). Picture-first, read-aloud flow.
  const [kidRecipe, setKidRecipe] = useState<Recipe | null>(null)
  const [recipeQuery, setRecipeQuery] = useState('')
  // Single active tag filter (null = all). Drives the chip row over the grid.
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const tags = useMemo(() => allTags(recipes), [recipes])
  // Match a planned supper to a saved recipe by (loose) title, so a day's meal can
  // open its recipe, and the grid can be filtered.
  const recipeByTitle = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.title.trim().toLowerCase(), r)
    return m
  }, [recipes])
  const shownRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase()
    const tf = tagFilter?.toLowerCase()
    return recipes.filter((r) => {
      if (q && !(r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q)))) return false
      if (tf && !(r.tags ?? []).some((tg) => tg.toLowerCase() === tf)) return false
      return true
    })
  }, [recipes, recipeQuery, tagFilter])
  // Cookability: which staple each recipe is missing (out of stock + not on the
  // list), fewest first. `cookFilter` only surfaces when there's a low item to
  // rank against, so it never appears as a no-op.
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const ranked = useMemo(() => rankCookable(shownRecipes, lowItems, listItems), [shownRecipes, lowItems, listItems])
  const missingById = useMemo(() => new Map(ranked.map((r) => [r.recipe.id, r.missing])), [ranked])
  const canCookFilter = lowItems.length > 0 && recipes.length > 0
  // "Use it up" ranking: which use-soon items each recipe would finish, most first.
  const soonItems = useMemo(() => (useSoonQ.data?.soon ?? []).map((s) => s.item), [useSoonQ.data])
  const rankedSoon = useMemo(() => rankUseSoon(shownRecipes, soonItems), [shownRecipes, soonItems])
  const usesById = useMemo(() => new Map(rankedSoon.map((r) => [r.recipe.id, r.uses])), [rankedSoon])
  const canUseSoonFilter = soonItems.length > 0 && recipes.length > 0
  const recipeOrder =
    useSoonFilter && canUseSoonFilter
      ? rankedSoon.map((r) => r.recipe)
      : cookFilter && canCookFilter
        ? ranked.map((r) => r.recipe)
        : shownRecipes
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
  async function saveMeal(date: number, title: string, staples: string[]) {
    await api('meals', { method: 'POST', body: { date, title, staples } }).catch(() => {})
    setEditDate(null)
    setMealText('')
    setStaplePrompt(null)
    qc.invalidateQueries({ queryKey: MEALS_KEY })
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

  // Toddler path to the same slot: a child taps a recipe, then a day. No staples
  // step (that's a parent's job) — just fill the supper and let the planned row
  // above redraw so the child sees their pick land on the menu.
  function kidPlan(date: number, recipe: Recipe) {
    setKidRecipe(null)
    saveMeal(date, recipe.title, [])
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

  async function addLow(e: React.FormEvent) {
    e.preventDefault()
    const item = newLow.trim()
    if (!item) return
    setNewLow('')
    await api('pantry', { method: 'POST', body: { item } }).catch(() => {})
    qc.invalidateQueries({ queryKey: PANTRY_KEY })
  }

  // Drop the cleared item from the low list at once, but DEFER the delete behind
  // an undo toast — a mis-tap is recoverable with no round-trip.
  function clearLowItem(l: LowRow) {
    const prev = qc.getQueryData<PantryData>(PANTRY_KEY)
    qc.setQueryData<PantryData>(PANTRY_KEY, (d) => (d ? { low: d.low.filter((x) => x.id !== l.id) } : d))
    undo({
      message: t.undo.cleared(l.item),
      onUndo: () => prev && qc.setQueryData(PANTRY_KEY, prev),
      onCommit: () => {
        api('pantry', { method: 'DELETE', body: { id: l.id } }).catch(() => {})
      },
    })
  }

  async function addSoon(e: React.FormEvent) {
    e.preventDefault()
    const item = newSoon.trim()
    if (!item) return
    setNewSoon('')
    await api('use-soon', { method: 'POST', body: { item } }).catch(() => {})
    qc.invalidateQueries({ queryKey: USE_SOON_KEY })
  }

  // Clear a use-soon item (used it / tossed it). Deferred behind the undo toast,
  // like the low list. No list side-effects — use-soon never touches shopping.
  function clearSoonItem(s: LowRow) {
    const prev = qc.getQueryData<{ soon: LowRow[] }>(USE_SOON_KEY)
    qc.setQueryData<{ soon: LowRow[] }>(USE_SOON_KEY, (d) => (d ? { soon: d.soon.filter((x) => x.id !== s.id) } : d))
    undo({
      message: t.undo.cleared(s.item),
      onUndo: () => prev && qc.setQueryData(USE_SOON_KEY, prev),
      onCommit: () => {
        api('use-soon', { method: 'DELETE', body: { id: s.id } }).catch(() => {})
      },
    })
  }

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

  // Toddler lens: just "what's for supper" this week, big and read-aloud. Each
  // supper draws its own food picture (pictoFor) so a pre-reader sees pizza/soup/
  // chicken — not seven identical plates.
  if (audience === 'toddler') {
    const planned: Tile[] = week
      .filter((d) => d.meal)
      .map((d) => ({
        key: String(d.date),
        icon: pictoFor(d.meal!.title, '🍽'),
        label: d.meal!.title,
        sub: formatWeekday(d.date, lang),
        narration: `${formatWeekday(d.date, lang)}: ${d.meal!.title}`,
      }))
    // The picker: tap a recipe to hear it (BigTiles speaks on tap) and choose it,
    // then tap a day to put it on the menu. The day tile's narration ("Lundi:
    // Pizza") doubles as the spoken confirmation, and `planned` above redraws so
    // the child watches their pick appear. A picture for every recipe (pictoFor)
    // so a pre-reader picks by sight, never by reading (NFR-KID-2).
    // Real photo when the recipe has one, the food picto as fallback — a
    // pre-reader recognizes "the orange soup we had" by its picture.
    const recipeTiles: Tile[] = recipes.map((r) => ({
      key: r.id,
      image: recipeImg(r.image),
      icon: pictoFor(r.title, '🍽'),
      label: r.title,
      onTap: () => setKidRecipe(r),
    }))
    const dayTiles: Tile[] = kidRecipe
      ? week.map(({ date, meal }) => ({
          key: String(date),
          icon: meal ? pictoFor(meal.title, '🍽') : '📅',
          label: formatWeekday(date, lang),
          sub: meal?.title,
          narration: `${formatWeekday(date, lang)}: ${kidRecipe.title}`,
          onTap: () => kidPlan(date, kidRecipe),
        }))
      : []
    return (
      <main className={`kid__main${recipes.length > 0 ? ' kid__main--feed' : ''}`}>
        <div className="kid-head">
          <span className="kid-head__emoji" aria-hidden="true">🍲</span>
          <p className="kid-head__title">{t.kid.supper}</p>
        </div>
        <BigTiles tiles={planned} empty={t.board.nothingTonight} />

        {recipes.length > 0 &&
          (kidRecipe ? (
            <section className="kid-pick">
              <div className="kid-head">
                <span className="kid-head__emoji" aria-hidden="true">
                  {pictoFor(kidRecipe.title, '🍽')}
                </span>
                <p className="kid-head__title">{t.kid.whichDay}</p>
              </div>
              <BigTiles tiles={dayTiles} />
              <button type="button" className="kid-pick__back mono" onClick={() => setKidRecipe(null)}>
                ← {t.kid.back}
              </button>
            </section>
          ) : (
            <section className="kid-pick">
              <div className="kid-head">
                <span className="kid-head__emoji" aria-hidden="true">📖</span>
                <p className="kid-head__title">{t.kid.pickMeal}</p>
              </div>
              <BigTiles tiles={recipeTiles} />
            </section>
          ))}
      </main>
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
                <span className="kitchen__day-tile" aria-hidden="true">
                  <Icon name="carrot-bold" size={18} color="var(--terracotta-deep)" />
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
                      {meal?.title ?? <span className="kitchen__day-empty mono">{t.kitchen.plan}</span>}
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
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>{t.kitchen.low}</h2>
          <form className="kitchen__low-add" onSubmit={addLow}>
            <input
              className="input"
              value={newLow}
              onChange={(e) => setNewLow(e.target.value)}
              placeholder={t.kitchen.lowAdd}
            />
            <button type="submit" className="btn" disabled={!newLow.trim()}>
              {t.capture.add}
            </button>
          </form>
          {low.length === 0 ? (
            <p className="board__empty mono">{t.kitchen.lowEmpty}</p>
          ) : (
            <ul className="kitchen__low">
              {low.map((l) => (
                <li key={l.id}>
                  <button type="button" className="board__list-item" onClick={() => clearLowItem(l)}>
                    <span className="board__check" aria-hidden="true">
                      ☐
                    </span>
                    <span>{l.item}</span>
                    <span className="kitchen__low-note mono">{t.kitchen.addToList}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>{t.kitchen.useSoon}</h2>
          <p className="kitchen__use-soon-hint mono">{t.kitchen.useSoonHint}</p>
          <form className="kitchen__soon-add" onSubmit={addSoon}>
            <input
              className="input"
              value={newSoon}
              onChange={(e) => setNewSoon(e.target.value)}
              placeholder={t.kitchen.useSoonAdd}
            />
            <button type="submit" className="btn" disabled={!newSoon.trim()}>
              {t.capture.add}
            </button>
          </form>
          {soon.length === 0 ? (
            <p className="board__empty mono">{t.kitchen.useSoonEmpty}</p>
          ) : (
            <ul className="kitchen__soon">
              {soon.map((s) => (
                <li key={s.id}>
                  <button type="button" className="board__list-item" onClick={() => clearSoonItem(s)}>
                    <span className="board__check" aria-hidden="true">
                      ☐
                    </span>
                    <span>{s.item}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="kitchen__head">
            <h2>{t.recipes.title}</h2>
            <button type="button" className="btn" onClick={() => setEditRecipe('new')}>
              ＋ {t.recipes.add}
            </button>
          </div>
          {(recipes.length > 3 || canCookFilter || canUseSoonFilter) && (
            <div className="kitchen__recipe-tools">
              {recipes.length > 3 && (
                <input
                  className="input kitchen__recipe-search"
                  value={recipeQuery}
                  onChange={(e) => setRecipeQuery(e.target.value)}
                  placeholder={t.recipes.search}
                  aria-label={t.recipes.search}
                />
              )}
              {canCookFilter && (
                <button
                  type="button"
                  className={`chip kitchen__cook-filter${cookFilter ? ' is-on' : ''}`}
                  onClick={() => {
                    setCookFilter((v) => !v)
                    setUseSoonFilter(false)
                  }}
                  aria-pressed={cookFilter}
                >
                  🍳 {t.recipes.cookable}
                </button>
              )}
              {canUseSoonFilter && (
                <button
                  type="button"
                  className={`chip kitchen__soon-filter${useSoonFilter ? ' is-on' : ''}`}
                  onClick={() => {
                    setUseSoonFilter((v) => !v)
                    setCookFilter(false)
                  }}
                  aria-pressed={useSoonFilter}
                >
                  ♻️ {t.recipes.useItUp}
                </button>
              )}
            </div>
          )}
          {tags.length > 0 && (
            <div className="kitchen__tag-filter">
              <button
                type="button"
                className={`chip${!tagFilter ? ' is-on' : ''}`}
                onClick={() => setTagFilter(null)}
                aria-pressed={!tagFilter}
              >
                {t.recipes.allTag}
              </button>
              {tags.map((tg) => {
                const on = tagFilter?.toLowerCase() === tg.toLowerCase()
                return (
                  <button
                    key={tg}
                    type="button"
                    className={`chip${on ? ' is-on' : ''}`}
                    onClick={() => setTagFilter(on ? null : tg)}
                    aria-pressed={on}
                  >
                    {tg}
                  </button>
                )
              })}
            </div>
          )}
          {recipes.length === 0 ? (
            <p className="board__empty mono">{t.recipes.empty}</p>
          ) : recipeOrder.length === 0 ? (
            <p className="board__empty mono">{t.recipes.empty}</p>
          ) : (
            <div className="recipe-grid">
              {recipeOrder.map((r) => {
                const img = recipeImg(r.image)
                const missing = missingById.get(r.id) ?? []
                const uses = usesById.get(r.id) ?? []
                return (
                  <button key={r.id} type="button" className="recipe-card surface" onClick={() => setViewRecipe(r)}>
                    <span className="recipe-card__thumb" aria-hidden="true">
                      {img ? <img src={img} alt="" loading="lazy" /> : <span className="recipe-card__noimg">🍳</span>}
                    </span>
                    <span className="recipe-card__title">{r.title}</span>
                    {useSoonFilter && canUseSoonFilter ? (
                      uses.length > 0 ? (
                        <span className="recipe-card__sub recipe-card__uses mono">♻ {t.recipes.usesN(uses.length)}</span>
                      ) : (
                        r.ingredients.length > 0 && (
                          <span className="recipe-card__sub mono">{t.recipes.count(r.ingredients.length)}</span>
                        )
                      )
                    ) : cookFilter && canCookFilter ? (
                      missing.length === 0 ? (
                        <span className="recipe-card__sub recipe-card__ready mono">✓ {t.recipes.ready}</span>
                      ) : (
                        <span className="recipe-card__sub recipe-card__missing mono">{t.recipes.missingN(missing.length)}</span>
                      )
                    ) : (
                      r.ingredients.length > 0 && (
                        <span className="recipe-card__sub mono">{t.recipes.count(r.ingredients.length)}</span>
                      )
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>
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
