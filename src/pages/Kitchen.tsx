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
import { useRecordUndo } from '../lib/toast'
import { live } from '../lib/query'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday, formatDay, formatDayLong, weekdayShort, dayNum } from '../lib/format'
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
import { DayManageSheet } from '../components/kitchen/DayManageSheet'
import { SIDE_SLOTS } from '../lib/mealSlots'
import { useKitchenActions, NO_KITCHEN_ACTIONS } from '../lib/kitchenActions'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The page owns the queries (one unauth
// gate for all), the week grid, and the layout; the FLOWS live as hooks beside
// the tab components in src/components/kitchen/* (useMealPlanning = type/pick a
// supper + the AI staples step, useRecipeShop = shop-the-week, useMealSuggest =
// supper ideas, useAiWake = the shared cold-start/AI-off truth).
// Intl lowercases the French weekday ("lundi 14 juin"); the sheet title wants it
// capitalized.
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function Kitchen() {
  const t = useT()
  const qc = useQueryClient()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { memberId: profileId } = useProfile()
  const nav = useNavigate()
  // Kitchen reads are live-polled, so a held (deferred) delete would be resurrected
  // mid-window by the poll. Instead these clears commit immediately and register a
  // COMPENSATING undo: the inverse re-creates the meal(s)/note from the snapshot we
  // grab before deleting. A new row id is fine — the plan looks restored.
  const recordUndo = useRecordUndo()
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
    const meal = qc.getQueryData<MealsData>(MEALS_KEY)?.days.find((m) => m.id === id)
    try {
      await api('meals', { method: 'DELETE', body: { id } })
      setEditDate(null)
      setMealText('')
      setEditSlot(null)
      setSlotText('')
      if (meal) recordUndo({ message: t.undo.mealRemoved(meal.title), onUndo: () => restoreMeals([meal]) })
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
  // Re-create a set of removed meals from their snapshot (the undo inverse). Each
  // comes back as a fresh row in the same day+slot — order/id may differ, the plan
  // reads as restored. Refresh the board too (today's supper shows there).
  async function restoreMeals(meals: MealRow[]) {
    for (const m of meals) {
      await api('meals', {
        method: 'POST',
        body: { date: m.date, slot: m.slot, title: m.title, recipeId: m.recipe_id ?? null },
      }).catch(() => {})
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: ['board'] })
  }
  // Easy clearing: wipe one slot's meals, or a whole day's. Snapshot the rows first
  // so Annuler can put them back (compensating undo — see recordUndo above).
  async function clearSlotMeals(date: number, slot: string) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter(
      (m) => m.date === date && m.slot === slot,
    )
    await api('meals', { method: 'POST', body: { action: 'clear', date, slot } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    if (removed.length) recordUndo({ message: t.undo.slotCleared, onUndo: () => restoreMeals(removed) })
  }
  async function clearDay(date: number) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === date)
    await api('meals', { method: 'POST', body: { action: 'clear', date } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    if (removed.length) recordUndo({ message: t.undo.dayCleared, onUndo: () => restoreMeals(removed) })
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
    const note = qc.getQueryData<DayNotesData>(DAY_NOTES_KEY)?.notes.find((n) => n.date === date)
    try {
      await api('day-notes', { method: 'DELETE', body: { date } })
      setEditNote(null)
      setNoteText('')
      if (note)
        recordUndo({
          message: t.undo.dayNoteCleared,
          onUndo: async () => {
            await api('day-notes', { method: 'POST', body: { date: note.date, text: note.text } }).catch(() => {})
            qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
            qc.invalidateQueries({ queryKey: ['board'] })
          },
        })
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
  // Which day's "Gérer" sheet is open (its full planning controls live there now,
  // off the calm read-only week grid). One at a time — so the souper/recipe-picker
  // singletons can't fight across days.
  const [manageDate, setManageDate] = useState<number | null>(null)
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
      kitchenActionsActive ? { shop: beginShopWeek, ai: suggest.suggestAi, book: suggest.suggestFromRecipes } : null,
      kitchenActionsActive
        ? {
            active: true,
            canShop: shoppableCount > 0,
            canAiSuggest: !suggest.aiOff,
            aiBusy: suggest.aiBusy,
            hasRecipes: suggest.hasRecipes,
          }
        : NO_KITCHEN_ACTIONS,
    )
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
  // Clear the shell's kitchen actions once, when La cuisine unmounts — so leaving
  // for another tab never leaves stale tiles in the ＋ sheet.
  useEffect(() => () => registerKitchen(null, NO_KITCHEN_ACTIONS), [registerKitchen])

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
              const note = noteFor(date)
              // A one-line glance of the lighter slots, for the read-only card —
              // "Déjeuner: gruau · Dîner: restes". Empty slots are skipped; the
              // full per-slot editing lives in the Gérer sheet.
              const sideSummary = SIDE_SLOTS.map((s) => {
                const ms = mealsFor(date, s)
                return ms.length ? `${t.kitchen.slots[s]}: ${ms.map((m) => m.title).join(', ')}` : null
              })
                .filter(Boolean)
                .join(' · ')
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
                {/* Calm, read-only glance — the souper headline, a one-line peek at
                    the other slots + note, and a single "Gérer" affordance. Every
                    edit moved into the DayManageSheet so two days fit a phone. */}
                <button
                  type="button"
                  className="kitchen__day-open"
                  onClick={() => setManageDate(date)}
                  aria-label={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                >
                  <span className="kitchen__day-sum">
                    {suppers.length ? (
                      <span className="kitchen__day-sum-main">{suppers.map((m) => m.title).join(' · ')}</span>
                    ) : (
                      <span className="kitchen__day-sum-empty mono">{t.kitchen.planShort}</span>
                    )}
                    {sideSummary && <span className="kitchen__day-sum-meta mono">{sideSummary}</span>}
                    {note && (
                      <span className="kitchen__day-sum-meta mono">
                        <InlineIcon name="pencil-simple-bold" /> {note.text}
                      </span>
                    )}
                  </span>
                  <span className="kitchen__day-manage mono">
                    <Icon name="pencil-simple-bold" size={14} /> {t.kitchen.manage}
                  </span>
                </button>
              </li>
              )
            })}
          </ul>

          {/* One day's full planning controls, opened from a row's "Gérer" button.
              State stays owned here (the souper flow + the recipe picker are page
              singletons); the sheet just renders them for the one open day. */}
          <DayManageSheet
            open={manageDate !== null}
            date={manageDate}
            title={manageDate !== null ? capitalize(formatDayLong(manageDate, lang)) : ''}
            onClose={() => setManageDate(null)}
            recipes={recipes}
            lowItems={lowItems}
            listItems={listItems}
            suppers={manageDate !== null ? mealsFor(manageDate, 'supper') : []}
            mealsFor={mealsFor}
            note={manageDate !== null ? noteFor(manageDate) : undefined}
            recipeFor={recipeForMeal}
            memberName={memberName}
            onOpenRecipe={(r) => nav(`/kitchen/recipe/${r.id}`)}
            plan={{ editDate, setEditDate, mealText, setMealText, staplesBusy, staplePrompt, saveMeal, beginSetMeal, toggleStaple }}
            picker={{ recipePickFor, setRecipePickFor, pickWithStaples, setPickWithStaples, planRecipe }}
            slotEdit={{ editSlot, setEditSlot, slotText, setSlotText, saveSlot }}
            noteEdit={{ editNote, setEditNote, noteText, setNoteText, saveNote, clearNote }}
            actions={{ clearMeal, moveMeal, clearSlotMeals, clearDay }}
          />

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
